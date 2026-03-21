const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

let overlayWindow = null;
let isInteractive = false;
let serverSocket  = null;

// ── IPC queue (buffer until renderer is ready) ────────────────────────────
let rendererReady = false;
const pendingIPCQueue = [];

function sendToRenderer(channel, data) {
  if (rendererReady && overlayWindow) {
    overlayWindow.webContents.send(channel, data);
  } else {
    pendingIPCQueue.push({ channel, data });
  }
}

function flushIPCQueue() {
  while (pendingIPCQueue.length > 0) {
    const { channel, data } = pendingIPCQueue.shift();
    overlayWindow.webContents.send(channel, data);
  }
}

// ── Socket.IO bridge ──────────────────────────────────────────────────────
function connectToServer() {
  try {
    const { io } = require('socket.io-client');
    serverSocket = io('http://localhost:3000', { reconnectionDelay: 2000 });

    serverSocket.on('connect',    () => console.log('[socket] connected to server'));
    serverSocket.on('disconnect', () => console.log('[socket] disconnected from server'));
    serverSocket.on('connect_error', (err) =>
      console.warn('[socket] server unreachable, retrying…', err.message)
    );

    // Server → renderer
    serverSocket.on('sync',     (ss)  => sendToRenderer('remote-sync',     ss));
    serverSocket.on('stroke',   (pts) => sendToRenderer('remote-stroke',   pts));
    serverSocket.on('clear',    ()    => sendToRenderer('remote-clear',    null));
    serverSocket.on('viewport', (vp)  => sendToRenderer('remote-viewport', vp));

  } catch (err) {
    console.warn('[socket] socket.io-client not available — run npm install');
  }
}

// ── Overlay window ────────────────────────────────────────────────────────
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  overlayWindow = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  overlayWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    flushIPCQueue();
  });
}

function toggleMode() {
  isInteractive = !isInteractive;

  if (isInteractive) {
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  sendToRenderer('mode-changed', isInteractive);
}

// ── IPC: renderer → server ────────────────────────────────────────────────
ipcMain.on('local-stroke', (_e, pts) => {
  if (serverSocket?.connected) serverSocket.emit('stroke', pts);
});

ipcMain.on('local-clear', () => {
  if (serverSocket?.connected) serverSocket.emit('clear');
});

ipcMain.on('local-viewport', (_e, vp) => {
  if (serverSocket?.connected) serverSocket.emit('viewport', vp);
});

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createOverlay();
  connectToServer();

  const f1ok = globalShortcut.register('F1', toggleMode);
  if (!f1ok) console.warn('[shortcut] F1 is taken — use Ctrl+` instead');
  globalShortcut.register('CommandOrControl+`', toggleMode);
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
});

ipcMain.on('request-work-mode', () => {
  if (isInteractive) toggleMode();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
