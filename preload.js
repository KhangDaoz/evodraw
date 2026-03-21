const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mode toggle
  onModeChanged:   (cb) => ipcRenderer.on('mode-changed',   (_e, v) => cb(v)),
  requestWorkMode: ()   => ipcRenderer.send('request-work-mode'),

  // Presenter → server: strokes and viewport
  sendStroke:   (pts) => ipcRenderer.send('local-stroke',   pts),
  sendClear:    ()    => ipcRenderer.send('local-clear'),
  sendViewport: (vp)  => ipcRenderer.send('local-viewport', vp),

  // Server → renderer: remote strokes and viewport
  onRemoteStroke:   (cb) => ipcRenderer.on('remote-stroke',   (_e, pts) => cb(pts)),
  onRemoteSync:     (cb) => ipcRenderer.on('remote-sync',     (_e, ss)  => cb(ss)),
  onRemoteClear:    (cb) => ipcRenderer.on('remote-clear',    ()        => cb()),
  onRemoteViewport: (cb) => ipcRenderer.on('remote-viewport', (_e, vp)  => cb(vp)),
});
