import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(serverUrl) {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');

  // Note: the renderer runs in a standard Chromium context (contextIsolation,
  // no nodeIntegration), so `Origin` is a forbidden header and cannot be set
  // from here. The packaged app loads via file://, so it sends `Origin: null`;
  // the server allows that opaque origin for the native desktop client.
  socket = io(serverUrl, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    auth: { token },
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
