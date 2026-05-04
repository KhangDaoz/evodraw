const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  screen,
  nativeImage,
} = require('electron');
const path = require('node:path');
const Store = require('electron-store');

// Handle Squirrel events (Windows installer)
if (require('electron-squirrel-startup')) app.quit();
// Squirrel launches the app once after install with this flag — don't open anything
if (process.argv.includes('--squirrel-firstrun')) app.quit();

const store = new Store({
  defaults: {
    hotkey: 'CommandOrControl+Shift+D',
    defaultColor: '#e03131',
    defaultWidth: 4,
    toolbarPosition: 'right',
    serverUrl: 'http://localhost:4000',
    username: '',
  },
});

let overlayWindow = null;
let tray = null;
let isDrawingMode = false;
let pendingDeepLink = null;

// ── Deep Link Protocol ──
const PROTOCOL = 'evodraw';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Single instance lock — second launch passes the deep link to the first
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
    if (overlayWindow) {
      if (overlayWindow.isMinimized()) overlayWindow.restore();
      overlayWindow.focus();
    }
  });
}

// macOS: open-url event
app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    const params = {
      room: parsed.searchParams.get('room'),
      token: parsed.searchParams.get('token'),
      server: parsed.searchParams.get('server') || store.get('serverUrl', 'http://localhost:4000'),
      shareId: parsed.searchParams.get('shareId'),
      username: parsed.searchParams.get('username'),
    };

    console.log('[Main] Deep link received:', params.room, params.shareId);

    if (overlayWindow && overlayWindow.webContents) {
      overlayWindow.show();
      overlayWindow.webContents.send('deep-link', params);
    } else {
      pendingDeepLink = params;
    }
  } catch (err) {
    console.error('[Main] Failed to parse deep link:', err);
  }
}

// ── Overlay Window ──
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  isDrawingMode = false;

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    overlayWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('screen-info', { width, height });
    overlayWindow.webContents.send('settings-loaded', store.store);
    // pendingDeepLink is NOT sent here; renderer fetches it via IPC on mount
  });
}

// ── Mode Toggle ──
function setDrawingMode(enabled) {
  if (!overlayWindow) return;

  isDrawingMode = enabled;

  if (enabled) {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.focus();
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  overlayWindow.webContents.send('mode-changed', enabled ? 'drawing' : 'working');
  updateTrayMenu();
  console.log(`[Main] Mode: ${enabled ? 'DRAWING' : 'WORKING'}`);
}

function toggleMode() {
  setDrawingMode(!isDrawingMode);
}

// ── Global Hotkey ──
function registerHotkey() {
  globalShortcut.unregisterAll();
  const hotkey = store.get('hotkey', 'CommandOrControl+Shift+D');
  const success = globalShortcut.register(hotkey, toggleMode);
  if (success) {
    console.log(`[Main] Hotkey registered: ${hotkey}`);
  } else {
    console.error(`[Main] Failed to register hotkey: ${hotkey}`);
  }
}

// ── Tray ──
function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isDrawingMode ? '🔴 Drawing Mode' : '🟢 Working Mode', click: toggleMode },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4y2P4z8BQz0BKYGBg+M/AwMBATmBgYPjPwMDAQE5gIEcDAFxRCgFXjNOXAAAAAElFTkSuQmCC',
      'base64'
    )
  );
  tray = new Tray(icon);
  tray.setToolTip('EvoDraw Desktop');
  updateTrayMenu();
  tray.on('click', toggleMode);
}

// ── IPC Handlers ──
function setupIPC() {
  ipcMain.on('overlay:set-mode', (_event, mode) => {
    setDrawingMode(mode === 'drawing');
  });

  ipcMain.on('overlay:set-ignore-mouse', (_event, ignore) => {
    if (!overlayWindow) return;
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle('overlay:get-settings', () => store.store);

  ipcMain.handle('overlay:save-settings', (_event, settings) => {
    if (settings.hotkey) { store.set('hotkey', settings.hotkey); registerHotkey(); }
    if (settings.defaultColor) store.set('defaultColor', settings.defaultColor);
    if (settings.defaultWidth) store.set('defaultWidth', settings.defaultWidth);
    if (settings.serverUrl) store.set('serverUrl', settings.serverUrl);
    if (settings.username !== undefined) store.set('username', settings.username);
    return store.store;
  });

  // Renderer fetches any deep-link params that arrived before React mounted
  ipcMain.handle('overlay:get-pending-deep-link', () => {
    const params = pendingDeepLink;
    pendingDeepLink = null;
    if (params && overlayWindow) overlayWindow.show();
    return params;
  });

  ipcMain.on('overlay:room-state', (_event, { inRoom }) => {
    tray?.setToolTip(inRoom ? 'EvoDraw — In Room' : 'EvoDraw Desktop');
    if (!inRoom && overlayWindow) overlayWindow.hide();
  });

  ipcMain.on('overlay:quit', () => app.quit());
}

// ── App Lifecycle ──
app.whenReady().then(() => {
  createOverlayWindow();
  registerHotkey();
  createTray();
  setupIPC();

  const deepLinkUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (deepLinkUrl) {
    // Page isn't loaded yet — store as pending so renderer fetches it on mount
    try {
      const parsed = new URL(deepLinkUrl);
      pendingDeepLink = {
        room: parsed.searchParams.get('room'),
        token: parsed.searchParams.get('token'),
        server: parsed.searchParams.get('server') || store.get('serverUrl', 'http://localhost:4000'),
        shareId: parsed.searchParams.get('shareId'),
        username: parsed.searchParams.get('username'),
      };
      console.log('[Main] Stored argv deep link as pending:', pendingDeepLink.room);
    } catch (err) {
      console.error('[Main] Failed to parse argv deep link:', err);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
