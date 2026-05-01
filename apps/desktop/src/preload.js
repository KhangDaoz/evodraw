import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onDrawingModeChanged: (callback) => ipcRenderer.on('drawing-mode-changed', (_event, value) => callback(value)),
  getDrawingMode: () => ipcRenderer.invoke('get-drawing-mode')
});
