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

    // NOTE: do NOT reset snapshotLoadedRef here. This effect re-runs on every
    // reconnect; resetting it would let a stale server snapshot destructively
    // reload (canvas.clear) and wipe newer local work. The ref persists for the
    // room session (a different room remounts the component → fresh ref).

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
      if (!elements) return
      if (snapshotLoadedRef.current) {
        // Already initialized (e.g. after a reconnect). Merge via LWW instead of
        // a destructive reload, so a stale/older server snapshot can't wipe newer
        // local objects — higher local versions win; only missing ones are added.
        for (const json of elements) {
          await applyRemoteOp(canvas, { type: 'object:added', object: json }, syncState.current)
        }
        canvas.requestRenderAll()
        return
      }
      // First load for this room session: replace the (empty) canvas.
      snapshotLoadedRef.current = true
      await loadCanvasSnapshot(canvas, { objects: elements, sceneVersion }, syncState.current)
      lastPushedVersionRef.current = sceneVersion || 0
      console.log(`[Sync] Loaded server snapshot (v${sceneVersion}, ${elements.length} elements)`)
    }

    // ── Peer-to-peer fallback (secondary) ──
    const onStateRequest = ({ requesterId }) => {
      const snapshot = serializeCanvas(canvas, { includeScreenShares: true })
      snapshot.bgColor = bgStateRef.current.canvasBgColor || null
      snapshot.bgId = bgStateRef.current.canvasBgId || 'default'
      socket.emit('canvas_state_response', { requesterId, snapshot })
    }

    const onStateInit = async ({ snapshot }) => {
      if (snapshot?.objects?.length > 0) {
        if (snapshotLoadedRef.current) {
          // Server snapshot already loaded — merge peer-only objects via LWW
          // (e.g. screen-share rects, which are excluded from MongoDB snapshots)
          for (const json of snapshot.objects) {
            await applyRemoteOp(canvas, { type: 'object:added', object: json }, syncState.current)
          }
          canvas.requestRenderAll()
        } else {
          snapshotLoadedRef.current = true
          await loadCanvasSnapshot(canvas, snapshot, syncState.current)
        }
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
    // Ask server for stored snapshot AND peers in parallel.
    // onStateInit merges via LWW so peer state works alongside server snapshot
    // (needed for screen-share rects which never enter MongoDB snapshots).
    socket.emit('request_snapshot', { roomId })
    socket.emit('canvas_state_request', { roomId })

    // ── Periodic snapshot push (dirty flag) ──
    const pushInterval = setInterval(() => {
      if (!canvas) return
      if (!canvas._evoIsDirty) return
      
      const currentVersion = getSceneVersion(canvas)
      if (currentVersion > 0 && currentVersion !== lastPushedVersionRef.current) {
        const { objects } = serializeCanvas(canvas)
        socket.emit('save_snapshot', { roomId, elements: objects, sceneVersion: currentVersion })
        lastPushedVersionRef.current = currentVersion
        canvas._evoIsDirty = false
        console.log(`[Sync] Pushed snapshot (v${currentVersion}, ${objects.length} elements)`)
      }
    }, SNAPSHOT_PUSH_INTERVAL_MS)

    return () => {
      detach()
      clearInterval(pushInterval)
      socket.off('canvas_op_received', onRemoteOp)
      socket.off('snapshot_loaded', onSnapshotLoaded)
      socket.off('canvas_state_request', onStateRequest)
      socket.off('canvas_state_init', onStateInit)
    }
  }, [canvas, roomId, isConnected])
}
