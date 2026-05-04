import { useState, useEffect, useRef, useCallback } from 'react'
import { RoomEvent, Track } from 'livekit-client'
import { getSocket } from '../services/socket'
import {
  createScreenShareOverlay,
  removeScreenShareOverlay,
  removeAllOverlays,
  findScreenShareRect,
} from '../utils/screenShareObject'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

/**
 * Screen share hook — handles both presenting and viewing.
 *
 * Uses LiveKit for media transport instead of manual WebRTC peer connections.
 * The DOM overlay architecture is preserved: a native <video> element renders
 * between the dot-grid and the Fabric canvas. A transparent proxy Rect handles
 * selection/move/resize. Drawings appear on top of the video.
 *
 * Publishing flow:
 *   1. Capture display media (getDisplayMedia) with user-selected constraints
 *   2. Publish the video track to LiveKit with shareId as the track name
 *   3. Create a local preview overlay on the canvas
 *   4. Emit screen:start via socket for metadata tracking
 *
 * Receiving flow:
 *   1. LiveKit fires TrackSubscribed for remote screen share tracks
 *   2. Extract the MediaStreamTrack, create a <video> element
 *   3. Feed into the existing setupOverlay() pipeline
 *
 * @param {string} roomId
 * @param {string} username
 * @param {boolean} isConnected
 * @param {fabric.Canvas|null} fabricCanvas
 * @param {import('livekit-client').Room} room - Shared LiveKit Room from useLiveKitRoom
 * @param {HTMLElement|null} screenShareLayer - The DOM layer for video overlays
 */
export default function useScreenShare(roomId, username, isConnected, fabricCanvas, room, screenShareLayer) {
  const [isSharing, setIsSharing] = useState(false)
  const [activeShares, setActiveShares] = useState(new Map()) // shareId -> { username }

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

    // Check if a proxy rect already exists on canvas (arrived via peer sync)
    const existingRect = findScreenShareRect(fabricCanvas, shareId)

    console.log('[ScreenShare] Setting up overlay:', videoEl.videoWidth, 'x', videoEl.videoHeight, 'for', sharerName,
      existingRect ? '(reusing synced rect)' : '(creating new rect)')

    const { proxyRect, isExisting } = createScreenShareOverlay(
      videoEl, shareId, sharerName, fabricCanvas, screenShareLayer, existingRect
    )

    // Only add to canvas if this is a freshly created rect (presenter or no peer data yet)
    if (!isExisting) {
      fabricCanvas.add(proxyRect)
    }
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
    if (!room) {
      console.warn('[ScreenShare] No LiveKit room available')
      return
    }
    console.log('[ScreenShare] Starting screen share...')

    try {
      const videoConstraints = buildVideoConstraints(initialRes, initialFps)

      // Capture screen using browser API (we manage this ourselves for overlay preview)
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

      // ── Launch the desktop overlay via deep link ──
      // Use a hidden iframe to open the protocol without navigating away from the web app.
      // The desktop app runs independently and connects to the same LiveKit room + server.
      const token = localStorage.getItem('token')
      const deepLinkUrl = `evodraw://start?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token || '')}&server=${encodeURIComponent(SERVER_URL)}&shareId=${encodeURIComponent(shareId)}&username=${encodeURIComponent(usernameRef.current)}`
      console.log('[ScreenShare] Launching desktop overlay:', deepLinkUrl)

      // Open without navigating away from the web app
      const deepLinkAnchor = document.createElement('a')
      deepLinkAnchor.href = deepLinkUrl
      deepLinkAnchor.style.display = 'none'
      document.body.appendChild(deepLinkAnchor)
      deepLinkAnchor.click()
      document.body.removeChild(deepLinkAnchor)

      // Publish video track to LiveKit (with shareId as track name for remote identification)
      try {
        await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.ScreenShare,
          name: shareId,
        })
        console.log('[ScreenShare] Video track published to LiveKit')

        if (audioTrack) {
          await room.localParticipant.publishTrack(audioTrack, {
            source: Track.Source.ScreenShareAudio,
            name: `${shareId}-audio`,
          })
          console.log('[ScreenShare] Audio track published to LiveKit')
        }
      } catch (err) {
        console.error('[ScreenShare] Failed to publish track to LiveKit', err)
      }

      // Notify room via socket signaling (for metadata tracking)
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
  }, [isSharing, fabricCanvas, screenShareLayer, room, roomId, generateShareId, buildVideoConstraints, setupOverlay])

  // Stop sharing my screen
  const stopSharing = useCallback(async () => {
    const shareId = shareIdRef.current
    if (!shareId) return

    // Stop the local media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    // Unpublish screen share tracks from LiveKit
    if (room) {
      try {
        for (const pub of room.localParticipant.trackPublications.values()) {
          if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
            await room.localParticipant.unpublishTrack(pub.track)
          }
        }
        console.log('[ScreenShare] Tracks unpublished from LiveKit')
      } catch (err) {
        console.error('[ScreenShare] Failed to unpublish tracks', err)
      }
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
  }, [room, roomId, removeShareObject])

  // Handle Socket.io signaling events (metadata tracking)
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !isConnected) return

    // Someone started sharing (socket-based notification)
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

  // Handle incoming remote screen share tracks from LiveKit
  useEffect(() => {
    if (!room || !fabricCanvas || !screenShareLayer) return

    const handleTrackSubscribed = (track, publication, participant) => {
      // Only handle screen share video tracks
      if (track.source !== Track.Source.ScreenShare || track.kind !== Track.Kind.Video) {
        return
      }

      // Use the track name as shareId (set by the publisher)
      const shareId = publication.trackName || `lk-${participant.identity}-${track.sid}`
      const sharerName = participant.name || participant.identity

      console.log(`[ScreenShare] Remote screen share track received from ${sharerName} (${shareId})`)

      // Skip if we already have an overlay for this share
      if (proxyRectsRef.current.has(shareId)) return

      // Create a video element and feed the LiveKit track into it
      const mediaStreamTrack = track.mediaStreamTrack
      const stream = new MediaStream([mediaStreamTrack])

      const videoEl = document.createElement('video')
      videoEl.srcObject = stream
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true

      videoEl.onloadedmetadata = () => {
        videoEl.play().then(() => {
          setupOverlay(videoEl, shareId, sharerName)
        }).catch(err => console.error('[ScreenShare] Remote video play failed', err))
      }

      // If the track is already producing frames, set up immediately
      if (mediaStreamTrack.readyState === 'live' && videoEl.readyState >= 2) {
        setupOverlay(videoEl, shareId, sharerName)
      }

      // Update active shares
      setActiveShares(prev => {
        const next = new Map(prev)
        next.set(shareId, { username: sharerName })
        return next
      })
    }

    const handleTrackUnsubscribed = (track, publication, participant) => {
      if (track.source !== Track.Source.ScreenShare || track.kind !== Track.Kind.Video) {
        return
      }

      const shareId = publication.trackName || `lk-${participant.identity}-${track.sid}`
      console.log(`[ScreenShare] Remote screen share track removed (${shareId})`)

      removeShareObject(shareId)

      setActiveShares(prev => {
        const next = new Map(prev)
        next.delete(shareId)
        return next
      })
    }

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

    // Watch for screen share rects removed by remote canvas sync
    // (e.g., another peer relayed the removal before LiveKit/Socket events arrived)
    const onObjectRemoved = ({ target }) => {
      if (target?._evoScreenShare && target._evoShareId) {
        removeScreenShareOverlay(target._evoShareId)
      }
    }
    fabricCanvas.on('object:removed', onObjectRemoved)

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      fabricCanvas.off('object:removed', onObjectRemoved)
    }
  }, [room, fabricCanvas, screenShareLayer, setupOverlay, removeShareObject])

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isSharing,
    activeShares,
    localShareId: shareIdRef.current,
    startSharing,
    stopSharing,
    changeResolution,
    changeFrameRate,
  }
}
