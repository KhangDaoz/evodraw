import { useState, useEffect, useCallback, useRef } from 'react'
import { connectSocket, disconnectSocket, getSocket } from '../services/socket'

export default function useRoom(roomCode, currentUsername, passcode) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState([])
  const [error, setError] = useState(null)
  const hasJoined = useRef(false)
  
  const usernameRef = useRef(currentUsername)

  useEffect(() => {
    usernameRef.current = currentUsername
  }, [currentUsername])

  const handleConnect = useCallback(() => {
    setIsConnected(true)
    setError(null)

    if (!hasJoined.current && roomCode && usernameRef.current) {
      const socket = getSocket()
      socket.emit('join_room', { roomId: roomCode, username: usernameRef.current, passcode })
      hasJoined.current = true
    }
  }, [roomCode, passcode])

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

  const handleUserJoined = useCallback((user) => {
    setConnectedUsers((prev) => {
      if (prev.some((u) => u.socketId === user.socketId)) return prev
      return [...prev, { socketId: user.socketId, username: user.username }]
    })
  }, [])

  const handleUserLeft = useCallback(({ socketId }) => {
    setConnectedUsers((prev) => prev.filter((u) => u.socketId !== socketId))
  }, [])

  const handleRoomUsers = useCallback(({ users }) => {
    // Server sends the full authoritative list; exclude self by socketId
    const myId = getSocket()?.id
    setConnectedUsers(users.filter((u) => u.socketId !== myId))
  }, [])

  const handleRoomError = useCallback((err) => {
    setError(`Access Denied: ${err.message}`)
    setIsConnected(false)
    hasJoined.current = false
  }, [])

  const updateUsername = useCallback((newUsername) => {
    usernameRef.current = newUsername
    const socket = getSocket()
    if (socket && isConnected) {
      socket.emit('update_username', { roomId: roomCode, newUsername })
    }
  }, [roomCode, isConnected])

  useEffect(() => {
    if (!roomCode || !usernameRef.current) return

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
      socket.emit('join_room', { roomId: roomCode, username: usernameRef.current, passcode })
      hasJoined.current = true
      setIsConnected(true)
    }

    return () => {
      const s = getSocket()
      if (s) {
        s.emit('leave_room', { roomId: roomCode, username: usernameRef.current })
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
    // Only bind on mount/unmount and static refs/handlers, excluding dynamic values like currentUsername
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, passcode, handleConnect, handleDisconnect, handleConnectError, handleUserJoined, handleUserLeft, handleRoomUsers, handleRoomError])

  return { isConnected, connectedUsers, error, updateUsername }
}
