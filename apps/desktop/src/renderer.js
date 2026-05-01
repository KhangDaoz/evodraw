/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

console.log(
  '👋 This message is being logged by "renderer.js", included via Vite',
);

const canvas = document.getElementById('draw-canvas');
const indicator = document.getElementById('overlay-indicator');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// receive toggle drawing mode from main process
window.electronAPI.onDrawingModeChanged((isDrawing) => {
  if (isDrawing) {
    // drawing mode → canvas + body receive mouse events
    document.body.style.pointerEvents = 'auto';
    canvas.style.pointerEvents = 'auto';
    document.body.style.cursor = 'crosshair';
    canvas.style.cursor = 'crosshair';
    canvas.style.background = 'rgba(0, 0, 0, 0.01)';

    indicator.className = 'mode-drawing';
    indicator.innerHTML = '⬤ Drawing Mode &mdash; Ctrl+Shift+D to exit';
  } else {
    // passthrough mode → canvas + body not receive mouse events
    document.body.style.pointerEvents = 'none';
    canvas.style.pointerEvents = 'none';
    document.body.style.cursor = 'default';
    canvas.style.cursor = 'default';
    canvas.style.background = 'transparent';

    indicator.className = 'mode-passthrough';
    indicator.innerHTML = '⬤ Click-through &mdash; Ctrl+Shift+D to draw';
  }

  console.log(`[Renderer] Drawing mode: ${isDrawing ? 'ON' : 'OFF'}`);
});

console.log('[Overlay Renderer] Loaded');
console.log(`[Overlay Renderer] Canvas size: ${canvas.width}x${canvas.height}`);