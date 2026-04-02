import { useState, useEffect, useCallback, useRef } from 'react'
import { connectSocket, disconnectSocket, getSocket } from '../services/socket'

export default function useRoom(roomCode, username, passcode) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState([])
  const [error, setError] = useState(null)
  const hasJoined = useRef(false)

  const handleConnect = useCallback(() => {
    setIsConnected(true)
    setError(null)

    if (!hasJoined.current && roomCode && username) {
      const socket = getSocket()
      socket.emit('join_room', { roomId: roomCode, username, passcode })
      hasJoined.current = true
    }
  }, [roomCode, username, passcode])

  const handleDisconnect = useCallback((reason) => {
    setIsConnected(false)
    if (reason === 'io server disconnect') {
      setError('Disconnected by server')
    }
  }, [])

  const handleConnectError = useCallback((err) => {
    setError(`Connection failed: ${err.message}`)
    setIsConnected(false)
  }, [])

  const handleUserJoined = useCallback(({ username: joinedUser }) => {
    setConnectedUsers((prev) => {
      if (prev.includes(joinedUser)) return prev
      return [...prev, joinedUser]
    })
  }, [])

  const handleUserLeft = useCallback(({ username: leftUser }) => {
    setConnectedUsers((prev) => prev.filter((u) => u !== leftUser))
  }, [])

  const handleRoomUsers = useCallback(({ users }) => {
    // Server sends the full authoritative list; exclude self
    setConnectedUsers(users.filter((u) => u !== username))
  }, [username])

  const handleRoomError = useCallback((err) => {
    setError(`Access Denied: ${err.message}`)
    setIsConnected(false)
    hasJoined.current = false
  }, [])

  useEffect(() => {
    if (!roomCode || !username) return

    const socket = connectSocket()

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('user_joined', handleUserJoined)
    socket.on('user_left', handleUserLeft)
    socket.on('room_users', handleRoomUsers)
    socket.on('room_error', handleRoomError)

    // If already connected when hook mounts
    if (socket.connected && !hasJoined.current) {
      socket.emit('join_room', { roomId: roomCode, username, passcode })
      hasJoined.current = true
      setIsConnected(true)
    }

    return () => {
      const s = getSocket()
      if (s) {
        s.emit('leave_room', { roomId: roomCode, username })
        s.off('connect', handleConnect)
        s.off('disconnect', handleDisconnect)
        s.off('connect_error', handleConnectError)
        s.off('user_joined', handleUserJoined)
        s.off('user_left', handleUserLeft)
        s.off('room_users', handleRoomUsers)
        s.off('room_error', handleRoomError)
      }
      hasJoined.current = false
      disconnectSocket()
    }
  }, [roomCode, username, passcode, handleConnect, handleDisconnect, handleConnectError, handleUserJoined, handleUserLeft, handleRoomUsers, handleRoomError])

  return { isConnected, connectedUsers, error }
}
