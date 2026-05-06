import { useState, useEffect } from 'react'
import { Room, RoomEvent } from 'livekit-client'
import { getSocket } from '../services/socket'

/**
 * Manages the LiveKit Room connection lifecycle.
 * Requests a JWT from the Node.js server (via Socket.io) and
 * connects to LiveKit Cloud. The returned `room` object is shared
 * between useVoiceChat and useScreenShare.
 *
 * Username is locked at room-join time and never changes mid-session,
 * so it is safe to include in the effect deps without risk of disconnect.
 *
 * @param {string} roomId  - EvoDraw room code
 * @param {string} username - Current user's display name (fixed for session)
 * @returns {{ room: Room, isLiveKitConnected: boolean }}
 */
export default function useLiveKitRoom(roomId, username) {
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

    const connectToRoom = () => {
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
    }

    const handleDisconnected = (reason) => {
      if (!cancelled) {
        console.log('[LiveKit] Disconnected from room — reason:', reason, '— reconnecting in 2s')
        setIsLiveKitConnected(false)
        setTimeout(() => {
          if (!cancelled && room.state !== 'connected') {
            console.log('[LiveKit] Attempting reconnect...')
            connectToRoom()
          }
        }, 2000)
      }
    }

    room.on(RoomEvent.Connected, handleConnected)
    room.on(RoomEvent.Disconnected, handleDisconnected)

    if (room.state === 'connected') {
      setIsLiveKitConnected(true)
    } else {
      connectToRoom()
    }

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
