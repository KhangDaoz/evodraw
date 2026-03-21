const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Shared state (in-memory)
const strokes = [];
let viewport = { nvx: 0, nvy: 0, vscale: 1 };

io.on('connection', (socket) => {
  console.log('[server] connected :', socket.id);

  // Sync new client with existing state
  socket.emit('sync', strokes);
  socket.emit('viewport', viewport);

  // Stroke: array of {x, y} normalised world coords
  socket.on('stroke', (pts) => {
    strokes.push(pts);
    socket.broadcast.emit('stroke', pts);
  });

  socket.on('clear', () => {
    strokes.length = 0;
    socket.broadcast.emit('clear');
  });

  // Viewport: {nvx, nvy, vscale}
  socket.on('viewport', (vp) => {
    viewport = vp;
    socket.broadcast.emit('viewport', vp);
  });

  socket.on('disconnect', () =>
    console.log('[server] disconnected:', socket.id)
  );
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[server] running → http://localhost:${PORT}`);
  console.log('[server] open the URL above in a browser to review');
});
