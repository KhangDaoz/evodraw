import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket } from '../services/socket'
import {
  createScreenShareOverlay,
  removeScreenShareOverlay,
  removeAllOverlays,
} from '../utils/screenShareObject'

/**
 * Screen share hook — handles both presenting and viewing.
 *
 * Screen shares use a hybrid DOM overlay approach: a native <video> element
 * renders in a DOM layer between the dot-grid and the Fabric canvas, giving
 * Discord-quality playback. A transparent Fabric proxy Rect handles
 * selection/move/resize. Drawings on the canvas appear on top of the video.
 *
 * @param {string} roomId
 * @param {string} username
 * @param {boolean} isConnected
 * @param {fabric.Canvas|null} fabricCanvas
 * @param {React.MutableRefObject} peersRef - Shared peer connection pool (from useVoiceChat)
 * @param {HTMLElement|null} screenShareLayer - The DOM layer for video overlays
 */
export default function useScreenShare(roomId, username, isConnected, fabricCanvas, peersRef, screenShareLayer) {
  const [isSharing, setIsSharing] = useState(false)
  const [activeShares, setActiveShares] = useState(new Map()) // shareId -> { socketId, username }

  const localStreamRef = useRef(null)
  const shareIdRef = useRef(null)
  const videoElementsRef = useRef(new Map()) // shareId -> HTMLVideoElement
  const proxyRectsRef = useRef(new Map()) // shareId -> fabric.Rect

  const usernameRef = useRef(username)
  useEffect(() => {
    usernameRef.current = username
  }, [username])

  // Generate a unique share ID
  const generateShareId = useCallback(() => {
    return `share-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }, [])

  // Remove a screen share overlay and cleanup resources
  const removeShareObject = useCallback((shareId) => {
    removeScreenShareOverlay(shareId, fabricCanvas)

    const videoEl = videoElementsRef.current.get(shareId)
    if (videoEl) {
      videoEl.srcObject = null
      if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl)
    }
    videoElementsRef.current.delete(shareId)
    proxyRectsRef.current.delete(shareId)
  }, [fabricCanvas])

  // Build video constraints from resolution and fps options
  const buildVideoConstraints = useCallback((res, fps) => {
    let constraints = { cursor: 'always' }
    if (res === '720p') {
      constraints.width = { ideal: 1280, max: 1280 }
      constraints.height = { ideal: 720, max: 720 }
    } else if (res === '1080p') {
      constraints.width = { ideal: 1920, max: 1920 }
      constraints.height = { ideal: 1080, max: 1080 }
    } else if (res === '4k') {
      constraints.width = { ideal: 3840, max: 3840 }
      constraints.height = { ideal: 2160, max: 2160 }
    }
    if (fps) {
      constraints.frameRate = { ideal: fps, max: fps }
    }
    return constraints
  }, [])

  // Change resolution of active share
  const changeResolution = useCallback(async (newRes) => {
    if (!localStreamRef.current) return
    const track = localStreamRef.current.getVideoTracks()[0]
    if (!track) return

    const settings = track.getSettings()
    const currentFps = settings.frameRate || 30
    const constraints = buildVideoConstraints(newRes, currentFps)

    try {
      await track.applyConstraints(constraints)
      console.log(`[ScreenShare] Resolution changed to ${newRes}`)
    } catch (err) {
      console.error('[ScreenShare] Failed to apply resolution constraints', err)
    }
  }, [buildVideoConstraints])

  // Change frame rate of active share
  const changeFrameRate = useCallback(async (newFps) => {
    if (!localStreamRef.current) return
    const track = localStreamRef.current.getVideoTracks()[0]
    if (!track) return

    try {
      await track.applyConstraints({ frameRate: { ideal: newFps, max: newFps } })
      console.log(`[ScreenShare] Frame rate changed to ${newFps} fps`)
    } catch (err) {
      console.error('[ScreenShare] Failed to apply frame rate constraints', err)
    }
  }, [])

  // Helper: create overlay for a video element once it's ready
  const setupOverlay = useCallback((videoEl, shareId, sharerName) => {
    if (!fabricCanvas || !screenShareLayer) return

    console.log('[ScreenShare] Setting up overlay:', videoEl.videoWidth, 'x', videoEl.videoHeight, 'for', sharerName)

    const { proxyRect } = createScreenShareOverlay(
      videoEl, shareId, sharerName, fabricCanvas, screenShareLayer
    )

    fabricCanvas.add(proxyRect)
    fabricCanvas.requestRenderAll()

    videoElementsRef.current.set(shareId, videoEl)
    proxyRectsRef.current.set(shareId, proxyRect)
  }, [fabricCanvas, screenShareLayer])

  // Start sharing my screen
  const startSharing = useCallback(async (initialRes = '1080p', withAudio = false, initialFps = 30) => {
    if (isSharing) {
      console.log('[ScreenShare] Already sharing, ignoring')
      return
    }
    if (!fabricCanvas || !screenShareLayer) {
      console.warn('[ScreenShare] fabricCanvas or screenShareLayer is null — cannot start sharing')
      return
    }
    console.log('[ScreenShare] Starting screen share...')

    try {
      const videoConstraints = buildVideoConstraints(initialRes, initialFps)

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: withAudio,
      })

      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      const audioTrack = stream.getAudioTracks()[0]

      localStreamRef.current = stream
      const shareId = generateShareId()
      shareIdRef.current = shareId
      setIsSharing(true)

      // Add video and audio tracks to all existing peer connections
      Object.entries(peersRef.current).forEach(([socketId, pc]) => {
        try {
          pc.addTrack(videoTrack, stream)
          if (audioTrack) {
            pc.addTrack(audioTrack, stream)
          }
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

      // Create local preview as a DOM overlay
      const videoEl = document.createElement('video')
      videoEl.srcObject = stream
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(() => {
          setupOverlay(videoEl, shareId, usernameRef.current + ' (You)')
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
  }, [isSharing, fabricCanvas, screenShareLayer, roomId, peersRef, generateShareId, buildVideoConstraints, setupOverlay])

  // Stop sharing my screen
  const stopSharing = useCallback(() => {
    const shareId = shareIdRef.current
    if (!shareId) return

    // Stop the media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())

      // Remove screen tracks from all peer connections
      Object.entries(peersRef.current).forEach(([socketId, pc]) => {
        const senders = pc.getSenders()
        const tracksToRemove = localStreamRef.current.getTracks()

        senders.forEach(sender => {
          if (sender.track && tracksToRemove.includes(sender.track)) {
            try {
              pc.removeTrack(sender)
            } catch (e) { /* connection may be closed */ }
          }
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

    // Remove overlay from DOM + proxy from canvas
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
    if (!fabricCanvas || !screenShareLayer) return

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
        videoElementsRef.current.set(retryKey, videoEl)

        // Store pending info for retry
        videoEl._pendingSocketId = socketId
        videoEl._pendingTrack = track
        videoEl._pendingStream = stream
        return
      }

      // Already have a proxy for this share? Skip
      if (proxyRectsRef.current.has(matchedShareId)) return

      const videoEl = document.createElement('video')
      videoEl.srcObject = stream || new MediaStream([track])
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(() => {
          setupOverlay(videoEl, matchedShareId, matchedUsername)
        }).catch(err => console.error('[ScreenShare] Remote video play failed', err))
      }
    }

    window.addEventListener('evodraw:remote_video_track', handleRemoteVideoTrack)

    return () => {
      window.removeEventListener('evodraw:remote_video_track', handleRemoteVideoTrack)
    }
  }, [fabricCanvas, screenShareLayer, activeShares, setupOverlay])

  // Retry pending video tracks when activeShares updates
  useEffect(() => {
    if (!fabricCanvas || !screenShareLayer || activeShares.size === 0) return

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

      if (!matchedShareId || proxyRectsRef.current.has(matchedShareId)) continue

      // Move from pending to real
      videoElementsRef.current.delete(key)

      videoEl.onloadedmetadata = () => {
        videoEl.play()
        setupOverlay(videoEl, matchedShareId, matchedUsername)
      }

      // If already loaded
      if (videoEl.readyState >= 2) {
        setupOverlay(videoEl, matchedShareId, matchedUsername)
      }
    }
  }, [fabricCanvas, screenShareLayer, activeShares, setupOverlay])

  // Handle new peer connections: add local screen tracks if sharing
  useEffect(() => {
    const handlePeerCreated = (e) => {
      const { pc } = e.detail
      if (!localStreamRef.current) return

      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (!videoTrack) return

      try {
        pc.addTrack(videoTrack, localStreamRef.current)
        if (audioTrack) {
          pc.addTrack(audioTrack, localStreamRef.current)
        }
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
      removeAllOverlays(fabricCanvas)
      for (const videoEl of videoElementsRef.current.values()) {
        videoEl.srcObject = null
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl)
      }
    }
  }, [])

  return {
    isSharing,
    activeShares,
    startSharing,
    stopSharing,
    changeResolution,
    changeFrameRate,
  }
}
