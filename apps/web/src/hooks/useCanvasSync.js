import { useEffect, useRef } from 'react'
import { getSocket } from '../services/socket'
import {
  attachSerializer,
  applyRemoteOp,
  serializeCanvas,
  loadCanvasSnapshot,
  getSceneVersion,
} from '../utils/canvasSerializer'

const SNAPSHOT_PUSH_INTERVAL_MS = 10_000
const SERVER_SNAPSHOT_TIMEOUT_MS = 2000

/**
 * Connects a Fabric canvas to the Socket.IO room for
 * real-time operation sync (object:added / modified / removed),
 * server-side snapshot persistence, and initial state recovery.
 */
export default function useCanvasSync(canvas, syncState, roomId, isConnected, canvasBgColor, canvasBgId, onBgColorReceived) {
  const bgStateRef = useRef({ canvasBgColor, canvasBgId })
  const lastPushedVersionRef = useRef(0)
  const snapshotLoadedRef = useRef(false)

  // Keep refs updated so closures see the latest value without re-binding everything
  useEffect(() => {
    bgStateRef.current = { canvasBgColor, canvasBgId }
  }, [canvasBgColor, canvasBgId])

  useEffect(() => {
    if (!canvas || !roomId || !isConnected) return

    const socket = getSocket()
    if (!socket || !socket.connected) return

    snapshotLoadedRef.current = false

    // ── Outbound: local changes → server ──
    const detach = attachSerializer(canvas, (op) => {
      socket.emit('canvas_op', { roomId, op })
    }, syncState.current)

    // ── Inbound: server → local canvas ──
    const onRemoteOp = async ({ op }) => {
      await applyRemoteOp(canvas, op, syncState.current)
    }

    // ── Server snapshot recovery (primary) ──
    const onSnapshotLoaded = async ({ elements, sceneVersion }) => {
      if (snapshotLoadedRef.current) return // Already loaded, skip
      if (elements && elements.length > 0) {
        snapshotLoadedRef.current = true
        await loadCanvasSnapshot(canvas, { objects: elements }, syncState.current)
        lastPushedVersionRef.current = sceneVersion || 0
        console.log(`[Sync] Loaded server snapshot (v${sceneVersion}, ${elements.length} elements)`)
      }
    }

    // ── Peer-to-peer fallback (secondary) ──
    const onStateRequest = ({ requesterId }) => {
      const snapshot = serializeCanvas(canvas)
      snapshot.bgColor = bgStateRef.current.canvasBgColor || null
      snapshot.bgId = bgStateRef.current.canvasBgId || 'default'
      socket.emit('canvas_state_response', { requesterId, snapshot })
    }

    const onStateInit = async ({ snapshot }) => {
      if (snapshotLoadedRef.current) return // Server snapshot already loaded
      if (snapshot?.objects?.length > 0) {
        snapshotLoadedRef.current = true
        await loadCanvasSnapshot(canvas, snapshot, syncState.current)
      }
      if (snapshot?.bgId && snapshot?.bgColor && onBgColorReceived) {
        onBgColorReceived(snapshot.bgId, snapshot.bgColor)
      } else if (snapshot?.bgColor && onBgColorReceived) {
        onBgColorReceived('default', snapshot.bgColor)
      }
    }

    // Register listeners
    socket.on('canvas_op_received', onRemoteOp)
    socket.on('snapshot_loaded', onSnapshotLoaded)
    socket.on('canvas_state_request', onStateRequest)
    socket.on('canvas_state_init', onStateInit)

    // ── Recovery flow ──
    // 1. Ask server for stored snapshot first
    socket.emit('request_snapshot', { roomId })

    // 2. After timeout, if server didn't respond, ask peers
    const peerFallbackTimer = setTimeout(() => {
      if (!snapshotLoadedRef.current) {
        console.log('[Sync] No server snapshot, requesting from peers...')
        socket.emit('canvas_state_request', { roomId })
      }
    }, SERVER_SNAPSHOT_TIMEOUT_MS)

    // ── Periodic snapshot push (dirty flag) ──
    const pushInterval = setInterval(() => {
      if (!canvas) return
      const currentVersion = getSceneVersion(canvas)
      if (currentVersion > 0 && currentVersion !== lastPushedVersionRef.current) {
        const { objects } = serializeCanvas(canvas)
        socket.emit('save_snapshot', { roomId, elements: objects, sceneVersion: currentVersion })
        lastPushedVersionRef.current = currentVersion
        console.log(`[Sync] Pushed snapshot (v${currentVersion}, ${objects.length} elements)`)
      }
    }, SNAPSHOT_PUSH_INTERVAL_MS)

    return () => {
      detach()
      clearTimeout(peerFallbackTimer)
      clearInterval(pushInterval)
      socket.off('canvas_op_received', onRemoteOp)
      socket.off('snapshot_loaded', onSnapshotLoaded)
      socket.off('canvas_state_request', onStateRequest)
      socket.off('canvas_state_init', onStateInit)
    }
  }, [canvas, roomId, isConnected])
}
