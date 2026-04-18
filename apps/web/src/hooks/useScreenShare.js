import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket } from '../services/socket'
import {
  createScreenShareImage,
  startFrameLoop,
  stopFrameLoop,
  stopAllFrameLoops,
} from '../utils/screenShareObject'

/**
 * Screen share hook — handles both presenting and viewing.
 *
 * Screen shares appear as movable/resizable fabric.Image objects on the canvas.
 * Multiple users can share simultaneously.
 *
 * @param {string} roomId
 * @param {string} username
 * @param {boolean} isConnected
 * @param {fabric.Canvas|null} fabricCanvas
 * @param {React.MutableRefObject} peersRef - Shared peer connection pool (from useVoiceChat)
 */
export default function useScreenShare(roomId, username, isConnected, fabricCanvas, peersRef) {
  const [isSharing, setIsSharing] = useState(false)
  const [activeShares, setActiveShares] = useState(new Map()) // shareId -> { socketId, username }

  const localStreamRef = useRef(null)
  const shareIdRef = useRef(null)
  const videoElementsRef = useRef(new Map()) // shareId -> HTMLVideoElement
  const fabricImagesRef = useRef(new Map()) // shareId -> fabric.Image

  const usernameRef = useRef(username)
  useEffect(() => {
    usernameRef.current = username
  }, [username])

  // Generate a unique share ID
  const generateShareId = useCallback(() => {
    return `share-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }, [])

  // Remove a screen share canvas object and cleanup resources
  const removeShareObject = useCallback((shareId) => {
    stopFrameLoop(shareId)

    const img = fabricImagesRef.current.get(shareId)
    if (img && fabricCanvas) {
      fabricCanvas.remove(img)
      fabricCanvas.requestRenderAll()
    }
    fabricImagesRef.current.delete(shareId)

    const videoEl = videoElementsRef.current.get(shareId)
    if (videoEl) {
      videoEl.srcObject = null
      videoEl.remove()
    }
    videoElementsRef.current.delete(shareId)
  }, [fabricCanvas])

  // Start sharing my screen
  const startSharing = useCallback(async () => {
    if (isSharing) {
      console.log('[ScreenShare] Already sharing, ignoring')
      return
    }
    if (!fabricCanvas) {
      console.warn('[ScreenShare] fabricCanvas is null — cannot start sharing')
      return
    }
    console.log('[ScreenShare] Starting screen share...')

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      })

      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      localStreamRef.current = stream
      const shareId = generateShareId()
      shareIdRef.current = shareId
      setIsSharing(true)

      // Add video track to all existing peer connections
      Object.entries(peersRef.current).forEach(([socketId, pc]) => {
        try {
          pc.addTrack(videoTrack, stream)
          // Renegotiate
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer).then(() => offer))
            .then(offer => {
              const socket = getSocket()
              if (socket) {
                socket.emit('webrtc:offer', {
                  targetSocketId: socketId,
                  offer,
                  senderName: usernameRef.current,
                })
              }
            })
            .catch(err => console.error('[ScreenShare] Renegotiation failed', err))
        } catch (err) {
          console.error('[ScreenShare] Failed to add track to peer', socketId, err)
        }
      })

      // Notify room via signaling
      const socket = getSocket()
      if (socket) {
        socket.emit('screen:start', { roomId, shareId })
      }

      // Also add to own canvas as a local preview
      const videoEl = document.createElement('video')
      videoEl.srcObject = stream
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.style.display = 'none'
      document.body.appendChild(videoEl)

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(() => {
          console.log('[ScreenShare] Local video playing, creating canvas object', videoEl.videoWidth, 'x', videoEl.videoHeight)
          const img = createScreenShareImage(videoEl, shareId, usernameRef.current + ' (You)', fabricCanvas)
          fabricCanvas.add(img)
          fabricCanvas.requestRenderAll()
          startFrameLoop(fabricCanvas, img, videoEl, shareId)

          videoElementsRef.current.set(shareId, videoEl)
          fabricImagesRef.current.set(shareId, img)
        }).catch(err => console.error('[ScreenShare] Local video play failed', err))
      }

      // Auto-cleanup when user clicks "Stop sharing" in browser chrome
      videoTrack.onended = () => {
        stopSharing()
      }
    } catch (err) {
      // User cancelled the screen picker
      console.log('[ScreenShare] Cancelled or error:', err.message)
      setIsSharing(false)
    }
  }, [isSharing, fabricCanvas, roomId, peersRef, generateShareId])

  // Stop sharing my screen
  const stopSharing = useCallback(() => {
    const shareId = shareIdRef.current
    if (!shareId) return

    // Stop the media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())

      // Remove video track from all peer connections
      Object.entries(peersRef.current).forEach(([socketId, pc]) => {
        const senders = pc.getSenders().filter(s => s.track?.kind === 'video')
        senders.forEach(sender => {
          try {
            pc.removeTrack(sender)
          } catch (e) { /* connection may be closed */ }
        })

        // Renegotiate
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer).then(() => offer))
          .then(offer => {
            const socket = getSocket()
            if (socket) {
              socket.emit('webrtc:offer', {
                targetSocketId: socketId,
                offer,
                senderName: usernameRef.current,
              })
            }
          })
          .catch(err => console.error('[ScreenShare] Renegotiation failed', err))
      })

      localStreamRef.current = null
    }

    // Remove local preview from canvas
    removeShareObject(shareId)

    // Notify room
    const socket = getSocket()
    if (socket) {
      socket.emit('screen:stop', { roomId, shareId })
    }

    shareIdRef.current = null
    setIsSharing(false)
  }, [roomId, peersRef, removeShareObject])

  // Handle Socket.io signaling events
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !isConnected) return

    // Someone started sharing
    const handleStarted = ({ socketId, shareId, username: sharerName }) => {
      setActiveShares(prev => {
        const next = new Map(prev)
        next.set(shareId, { socketId, username: sharerName })
        return next
      })
    }

    // Someone stopped sharing
    const handleStopped = ({ shareId }) => {
      removeShareObject(shareId)
      setActiveShares(prev => {
        const next = new Map(prev)
        next.delete(shareId)
        return next
      })
    }

    // Late joiner: get list of active shares
    const handleActiveList = ({ shares }) => {
      const map = new Map()
      for (const s of shares) {
        map.set(s.shareId, { socketId: s.socketId, username: s.username })
      }
      setActiveShares(map)
    }

    socket.on('screen:started', handleStarted)
    socket.on('screen:stopped', handleStopped)
    socket.on('screen:active_list', handleActiveList)

    // Request active shares on mount (late joiner)
    socket.emit('screen:get_active', { roomId })

    return () => {
      socket.off('screen:started', handleStarted)
      socket.off('screen:stopped', handleStopped)
      socket.off('screen:active_list', handleActiveList)
    }
  }, [isConnected, roomId, removeShareObject])

  // Handle incoming remote video tracks (from WebRTC)
  useEffect(() => {
    if (!fabricCanvas) return

    const handleRemoteVideoTrack = (e) => {
      const { socketId, track, stream } = e.detail

      // Find which shareId this socketId corresponds to
      let matchedShareId = null
      let matchedUsername = null
      for (const [shareId, info] of activeShares.entries()) {
        if (info.socketId === socketId) {
          matchedShareId = shareId
          matchedUsername = info.username
          break
        }
      }

      if (!matchedShareId) {
        // No matching share found yet — buffer it and retry when activeShares updates
        console.log('[ScreenShare] Received video track but no matching share yet for', socketId)
        // Store the track to retry
        const retryKey = `pending-${socketId}`
        if (videoElementsRef.current.has(retryKey)) return // Already pending
        
        const videoEl = document.createElement('video')
        videoEl.srcObject = stream || new MediaStream([track])
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.autoplay = true
        videoEl.style.display = 'none'
        document.body.appendChild(videoEl)
        videoElementsRef.current.set(retryKey, videoEl)

        // Store pending info for retry
        videoEl._pendingSocketId = socketId
        videoEl._pendingTrack = track
        videoEl._pendingStream = stream
        return
      }

      // Already have a canvas object for this share? Skip
      if (fabricImagesRef.current.has(matchedShareId)) return

      const videoEl = document.createElement('video')
      videoEl.srcObject = stream || new MediaStream([track])
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.style.display = 'none'
      document.body.appendChild(videoEl)

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(() => {
          console.log('[ScreenShare] Remote video playing, creating canvas object', videoEl.videoWidth, 'x', videoEl.videoHeight)
          const img = createScreenShareImage(videoEl, matchedShareId, matchedUsername, fabricCanvas)
          fabricCanvas.add(img)
          fabricCanvas.sendObjectToBack(img)
          fabricCanvas.requestRenderAll()
          startFrameLoop(fabricCanvas, img, videoEl, matchedShareId)

          videoElementsRef.current.set(matchedShareId, videoEl)
          fabricImagesRef.current.set(matchedShareId, img)
        }).catch(err => console.error('[ScreenShare] Remote video play failed', err))
      }
    }

    window.addEventListener('evodraw:remote_video_track', handleRemoteVideoTrack)

    return () => {
      window.removeEventListener('evodraw:remote_video_track', handleRemoteVideoTrack)
    }
  }, [fabricCanvas, activeShares])

  // Retry pending video tracks when activeShares updates
  useEffect(() => {
    if (!fabricCanvas || activeShares.size === 0) return

    for (const [key, videoEl] of videoElementsRef.current.entries()) {
      if (!key.startsWith('pending-')) continue

      const socketId = videoEl._pendingSocketId
      let matchedShareId = null
      let matchedUsername = null
      for (const [shareId, info] of activeShares.entries()) {
        if (info.socketId === socketId) {
          matchedShareId = shareId
          matchedUsername = info.username
          break
        }
      }

      if (!matchedShareId || fabricImagesRef.current.has(matchedShareId)) continue

      // Move from pending to real
      videoElementsRef.current.delete(key)

      videoEl.onloadedmetadata = () => {
        videoEl.play()
        const img = createScreenShareImage(videoEl, matchedShareId, matchedUsername, fabricCanvas)
        fabricCanvas.add(img)
        fabricCanvas.sendObjectToBack(img)
        fabricCanvas.requestRenderAll()
        startFrameLoop(fabricCanvas, img, videoEl, matchedShareId)

        videoElementsRef.current.set(matchedShareId, videoEl)
        fabricImagesRef.current.set(matchedShareId, img)
      }

      // If already loaded
      if (videoEl.readyState >= 2) {
        const img = createScreenShareImage(videoEl, matchedShareId, matchedUsername, fabricCanvas)
        fabricCanvas.add(img)
        fabricCanvas.sendObjectToBack(img)
        fabricCanvas.requestRenderAll()
        startFrameLoop(fabricCanvas, img, videoEl, matchedShareId)

        videoElementsRef.current.set(matchedShareId, videoEl)
        fabricImagesRef.current.set(matchedShareId, img)
      }
    }
  }, [fabricCanvas, activeShares])

  // Handle new peer connections: add local video track if sharing
  useEffect(() => {
    const handlePeerCreated = (e) => {
      const { pc } = e.detail
      if (!localStreamRef.current) return

      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (!videoTrack) return

      try {
        pc.addTrack(videoTrack, localStreamRef.current)
      } catch (err) {
        console.error('[ScreenShare] Failed to add track to new peer', err)
      }
    }

    window.addEventListener('evodraw:peer_created', handlePeerCreated)
    return () => {
      window.removeEventListener('evodraw:peer_created', handlePeerCreated)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
      }
      stopAllFrameLoops()
      for (const videoEl of videoElementsRef.current.values()) {
        videoEl.srcObject = null
        videoEl.remove()
      }
    }
  }, [])

  return {
    isSharing,
    activeShares,
    startSharing,
    stopSharing,
  }
}
