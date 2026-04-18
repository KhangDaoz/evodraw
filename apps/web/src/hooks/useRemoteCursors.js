import { useRef, useEffect, useState, useCallback } from 'react'
import { getSocket } from '../services/socket'

const CURSOR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

function getCursorColor(name) {
  let hash = 0
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

const CURSOR_STALE_MS = 3000
const CURSOR_THROTTLE_MS = 50

/**
 * Manages remote cursor display and local cursor emission.
 *
 * - Listens for `cursor_moved` events and tracks remote positions
 * - Emits throttled `cursor_move` events on local mouse movement
 * - Auto-removes stale cursors after CURSOR_STALE_MS
 * - Provides sceneToScreen conversion for rendering overlays
 *
 * @returns {{ remoteCursors: Object, sceneToScreen: Function, viewportVersion: number, getCursorColor: Function }}
 */
export default function useRemoteCursors(fabricCanvas, roomId, username, isConnected) {
  const [remoteCursors, setRemoteCursors] = useState({})
  const [viewportVersion, setViewportVersion] = useState(0)
  const lastEmitRef = useRef(0)
  const staleTimersRef = useRef({})

  // Listen for remote cursor updates
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !roomId || !isConnected) return

    const handleCursorMoved = ({ position, username: remoteUser }) => {
      if (!remoteUser || remoteUser === username) return

      setRemoteCursors(prev => ({
        ...prev,
        [remoteUser]: { x: position.x, y: position.y },
      }))

      // Reset stale timer for this user
      if (staleTimersRef.current[remoteUser]) {
        clearTimeout(staleTimersRef.current[remoteUser])
      }
      staleTimersRef.current[remoteUser] = setTimeout(() => {
        setRemoteCursors(prev => {
          const next = { ...prev }
          delete next[remoteUser]
          return next
        })
        delete staleTimersRef.current[remoteUser]
      }, CURSOR_STALE_MS)
    }

    socket.on('cursor_moved', handleCursorMoved)

    return () => {
      socket.off('cursor_moved', handleCursorMoved)
      Object.values(staleTimersRef.current).forEach(clearTimeout)
      staleTimersRef.current = {}
    }
  }, [roomId, isConnected, username])

  // Emit own cursor position (throttled) on mouse move
  useEffect(() => {
    if (!fabricCanvas || !roomId || !isConnected) return

    const onMouseMove = (opt) => {
      const now = Date.now()
      if (now - lastEmitRef.current < CURSOR_THROTTLE_MS) return
      lastEmitRef.current = now

      const socket = getSocket()
      if (!socket) return

      const pt = fabricCanvas.getScenePoint(opt.e)
      socket.emit('cursor_move', { roomId, position: { x: pt.x, y: pt.y }, username })
    }

    fabricCanvas.on('mouse:move', onMouseMove)

    return () => {
      fabricCanvas.off('mouse:move', onMouseMove)
    }
  }, [fabricCanvas, roomId, isConnected, username])

  // Track viewport changes so cursor overlays re-render at correct positions
  useEffect(() => {
    const onZoom = () => setViewportVersion(v => v + 1)
    window.addEventListener('evodraw:zoom', onZoom)
    return () => window.removeEventListener('evodraw:zoom', onZoom)
  }, [])

  // Convert scene-space position to screen-space pixel position
  // eslint-disable-next-line no-unused-vars
  const sceneToScreen = useCallback((sceneX, sceneY, _version) => {
    if (!fabricCanvas) return { x: 0, y: 0 }
    const vpt = fabricCanvas.viewportTransform
    return {
      x: sceneX * vpt[0] + vpt[4],
      y: sceneY * vpt[3] + vpt[5],
    }
  }, [fabricCanvas])

  return { remoteCursors, sceneToScreen, viewportVersion, getCursorColor }
}
