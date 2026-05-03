const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mode changes (main → renderer)
  onModeChange: (callback) =>
    ipcRenderer.on('mode-changed', (_e, mode) => callback(mode)),

  // Deep link received (main → renderer)
  onDeepLink: (callback) =>
    ipcRenderer.on('deep-link', (_e, params) => callback(params)),

  // Screen info (main → renderer)
  onScreenInfo: (callback) =>
    ipcRenderer.on('screen-info', (_e, info) => callback(info)),

  // Settings loaded (main → renderer)
  onSettingsLoaded: (callback) =>
    ipcRenderer.on('settings-loaded', (_e, settings) => callback(settings)),

  // Show settings modal (main → renderer, triggered from tray)
  onShowSettings: (callback) =>
    ipcRenderer.on('show-settings', () => callback()),

  // Renderer → main
  setMode: (mode) => ipcRenderer.send('overlay:set-mode', mode),
  setIgnoreMouse: (ignore) =>
    ipcRenderer.send('overlay:set-ignore-mouse', ignore),
  quit: () => ipcRenderer.send('overlay:quit'),

  // Settings (invoke = async with response)
  getSettings: () => ipcRenderer.invoke('overlay:get-settings'),
  saveSettings: (settings) =>
    ipcRenderer.invoke('overlay:save-settings', settings),
});
