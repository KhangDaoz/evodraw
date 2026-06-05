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
const CURSOR_THROTTLE_MS = 80
// Lerp factor applied per animation frame toward the latest network position.
const CURSOR_SMOOTHING = 0.25
// Stop interpolating once within this many scene units of the target.
const CURSOR_SNAP_EPSILON = 0.5
// Skip emitting if the cursor barely moved (scene units) since the last send.
const CURSOR_EMIT_MIN_DELTA = 1

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
  const lastEmitPosRef = useRef(null)
  const staleTimersRef = useRef({})
  // Latest network positions (interpolation targets) and currently displayed
  // (interpolated) positions, both in scene space, keyed by username.
  const targetsRef = useRef({})
  const displayRef = useRef({})
  const rafRef = useRef(null)

  // Listen for remote cursor updates
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !roomId || !isConnected) return

    // Animation loop: ease each displayed cursor toward its network target so
    // motion stays smooth at render rate even though positions arrive ~12/sec.
    const tick = () => {
      const targets = targetsRef.current
      const display = displayRef.current
      let moving = false

      for (const user of Object.keys(targets)) {
        const target = targets[user]
        const cur = display[user] || { x: target.x, y: target.y }
        const dx = target.x - cur.x
        const dy = target.y - cur.y
        if (Math.abs(dx) < CURSOR_SNAP_EPSILON && Math.abs(dy) < CURSOR_SNAP_EPSILON) {
          display[user] = { x: target.x, y: target.y }
        } else {
          display[user] = { x: cur.x + dx * CURSOR_SMOOTHING, y: cur.y + dy * CURSOR_SMOOTHING }
          moving = true
        }
      }

      setRemoteCursors(Object.fromEntries(
        Object.entries(display).map(([user, pos]) => [user, { x: pos.x, y: pos.y }])
      ))

      // Idle when everything has settled; the next network update restarts us.
      rafRef.current = moving ? requestAnimationFrame(tick) : null
    }

    const ensureRunning = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick)
    }

    const handleCursorMoved = ({ position, username: remoteUser }) => {
      if (!remoteUser || remoteUser === username) return

      targetsRef.current[remoteUser] = { x: position.x, y: position.y }
      // First sighting: snap display to target so it doesn't fly in from origin.
      if (!displayRef.current[remoteUser]) {
        displayRef.current[remoteUser] = { x: position.x, y: position.y }
      }
      ensureRunning()

      // Reset stale timer for this user
      if (staleTimersRef.current[remoteUser]) {
        clearTimeout(staleTimersRef.current[remoteUser])
      }
      staleTimersRef.current[remoteUser] = setTimeout(() => {
        delete targetsRef.current[remoteUser]
        delete displayRef.current[remoteUser]
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
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [roomId, isConnected, username])

  const throttleTimeoutRef = useRef(null)

  // Emit own cursor position (throttled) on mouse move
  useEffect(() => {
    if (!fabricCanvas || !roomId || !isConnected) return

    const onMouseMove = (opt) => {
      const now = Date.now()
      const pt = fabricCanvas.getScenePoint(opt.e)

      // Skip near-duplicate positions so an idle/jittery mouse doesn't emit.
      const last = lastEmitPosRef.current
      if (last && Math.abs(pt.x - last.x) < CURSOR_EMIT_MIN_DELTA && Math.abs(pt.y - last.y) < CURSOR_EMIT_MIN_DELTA) {
        return
      }

      const emitMove = () => {
        const socket = getSocket()
        if (socket) {
          socket.emit('cursor_move', { roomId, position: { x: pt.x, y: pt.y }, username })
          lastEmitRef.current = Date.now()
          lastEmitPosRef.current = { x: pt.x, y: pt.y }
        }
      }

      const timeSinceLastEmit = now - lastEmitRef.current

      if (timeSinceLastEmit >= CURSOR_THROTTLE_MS) {
        emitMove()
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current)
          throttleTimeoutRef.current = null
        }
      } else {
        if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current)
        throttleTimeoutRef.current = setTimeout(emitMove, CURSOR_THROTTLE_MS - timeSinceLastEmit)
      }
    }

    fabricCanvas.on('mouse:move', onMouseMove)

    return () => {
      fabricCanvas.off('mouse:move', onMouseMove)
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current)
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
