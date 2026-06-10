const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // main → renderer events — each returns a cleanup function
  onModeChange: (cb) => {
    const h = (_e, mode) => cb(mode);
    ipcRenderer.on('mode-changed', h);
    return () => ipcRenderer.removeListener('mode-changed', h);
  },
  onDeepLink: (cb) => {
    const h = (_e, params) => cb(params);
    ipcRenderer.on('deep-link', h);
    return () => ipcRenderer.removeListener('deep-link', h);
  },
  onScreenInfo: (cb) => {
    const h = (_e, info) => cb(info);
    ipcRenderer.on('screen-info', h);
    return () => ipcRenderer.removeListener('screen-info', h);
  },
  onSettingsLoaded: (cb) => {
    const h = (_e, settings) => cb(settings);
    ipcRenderer.on('settings-loaded', h);
    return () => ipcRenderer.removeListener('settings-loaded', h);
  },
  onShowSettings: (cb) => {
    const h = () => cb();
    ipcRenderer.on('show-settings', h);
    return () => ipcRenderer.removeListener('show-settings', h);
  },

  // renderer → main
  setMode: (mode) => ipcRenderer.send('overlay:set-mode', mode),
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),
  quit: () => ipcRenderer.send('overlay:quit'),
  notifyRoomState: (state) => ipcRenderer.send('overlay:room-state', state),

  // async (invoke = request/response)
  getSettings: () => ipcRenderer.invoke('overlay:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('overlay:save-settings', settings),
  getPendingDeepLink: () => ipcRenderer.invoke('overlay:get-pending-deep-link'),
});
