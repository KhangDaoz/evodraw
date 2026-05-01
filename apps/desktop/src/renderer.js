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

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// const ctx = canvas.getContext('2d');
// const centerX = canvas.width / 2;
// const centerY = canvas.height / 2;
// ctx.strokeStyle = 'rgba(255, 51, 102, 0.7)';
// ctx.lineWidth = 2;
// // Đường ngang
// ctx.beginPath();
// ctx.moveTo(centerX - 30, centerY);
// ctx.lineTo(centerX + 30, centerY);
// ctx.stroke();
// // Đường dọc
// ctx.beginPath();
// ctx.moveTo(centerX, centerY - 30);
// ctx.lineTo(centerX, centerY + 30);
// ctx.stroke();
// // Vòng tròn
// ctx.beginPath();
// ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
// ctx.stroke();