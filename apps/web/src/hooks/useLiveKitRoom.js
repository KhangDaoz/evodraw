import { useState, useEffect } from 'react'
import { Room, RoomEvent } from 'livekit-client'
import { getSocket } from '../services/socket'

/**
 * Manages the LiveKit Room connection lifecycle.
 * Requests a JWT from the Node.js server (via Socket.io) and
 * connects to LiveKit Cloud. The returned `room` object is shared
 * between useVoiceChat and useScreenShare.
 *
 * @param {string} roomId  - EvoDraw room code
 * @param {string} username - Current user's display name
 * @returns {{ room: Room, isLiveKitConnected: boolean }}
 */
export default function useLiveKitRoom(roomId, username) {
  // Room is created once and reused across the component lifecycle.
  const [room] = useState(() => new Room({
    adaptiveStream: true,
    dynacast: true,
  }))
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !roomId || !username) return

    let cancelled = false

    const handleConnected = () => {
      if (!cancelled) {
        console.log('[LiveKit] Connected to room')
        setIsLiveKitConnected(true)
      }
    }

    const handleDisconnected = () => {
      if (!cancelled) {
        console.log('[LiveKit] Disconnected from room')
        setIsLiveKitConnected(false)
      }
    }

    room.on(RoomEvent.Connected, handleConnected)
    room.on(RoomEvent.Disconnected, handleDisconnected)

    // Request a token from the server and connect
    socket.emit('livekit:get-token', { roomId, username }, async (response) => {
      if (cancelled) return

      if (response?.error) {
        console.error('[LiveKit] Token error:', response.error)
        return
      }

      try {
        await room.connect(response.url, response.token)
        console.log('[LiveKit] Room connected successfully')
      } catch (err) {
        console.error('[LiveKit] Connection failed:', err)
      }
    })

    return () => {
      cancelled = true
      room.off(RoomEvent.Connected, handleConnected)
      room.off(RoomEvent.Disconnected, handleDisconnected)
      room.disconnect()
      setIsLiveKitConnected(false)
    }
  }, [room, roomId, username])

  return { room, isLiveKitConnected }
}
