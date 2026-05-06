import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

let socket = null

export function connectSocket() {
  if (socket?.connected) return socket

  const token = localStorage.getItem('token')

  // Polling first, then upgrade to WebSocket. Websocket-first surfaces a hard
  // 400 on the upgrade probe in some setups (Express 5 + Engine.IO upgrade
  // handshake); polling-first always succeeds and the upgrade silently falls
  // back to polling if it fails.
  socket = io(SERVER_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    auth: {
      token
    }
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
