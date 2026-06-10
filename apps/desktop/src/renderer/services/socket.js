import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(serverUrl) {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');

  socket = io(serverUrl, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    auth: { token },
    extraHeaders: {
      origin: serverUrl.replace(/^(https?:\/\/[^/]+).*/, '$1'),
    },
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
