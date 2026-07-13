import { useEffect } from 'react'
import * as fabric from 'fabric'
import { getSocket } from '../services/socket'

const FLUSH_INTERVAL_MS = 40
// Preview removal fallbacks: the final synced Path normally replaces the
// preview via its _evoStrokeId, but the final op can be lost/dropped.
const END_GRACE_MS = 2000
const STALE_SWEEP_MS = 5000
const STALE_AFTER_MS = 10_000

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Live-streams in-progress pen strokes so peers watch the stroke being
 * drawn instead of seeing it pop in after mouse-up.
 *
 * Sender: batches scene points every 40 ms → `stroke_progress`, then
 * `stroke_end` on mouse-up. The finished Fabric Path is tagged with the
 * stroke id (before:path:created) so its synced `object:added` op lets
 * peers swap preview → final without flicker.
 *
 * Receiver: renders each in-progress stroke as an ephemeral, non-evented
 * Polyline (`_evoLivePreview`) that the serializer and history skip.
 */
export default function useLiveStrokes(canvas, roomCode, isConnected) {
  useEffect(() => {
    if (!canvas || !roomCode || !isConnected) return
    const socket = getSocket()
    if (!socket || !socket.connected) return

    // ── Sender ──
    let strokeId = null
    let strokeStyle = null
    let pointBuffer = []
    let flushTimer = null

    const flush = () => {
      if (!strokeId || pointBuffer.length === 0) return
      socket.emit('stroke_progress', {
        roomCode,
        stroke: { id: strokeId, points: pointBuffer, style: strokeStyle },
      })
      pointBuffer = []
    }

    const onMouseDown = (opt) => {
      // Mirror the temp-pan exclusions (middle/right button, alt) so a pan
      // gesture in pen mode never starts a phantom stroke.
      if (!canvas.isDrawingMode) return
      if (opt.e.button === 1 || opt.e.button === 2 || opt.e.altKey) return
      const brush = canvas.freeDrawingBrush
      strokeId = crypto.randomUUID()
      strokeStyle = {
        color: brush?.color || '#000000',
        width: brush?.width || 5,
        dashArray: brush?.strokeDashArray || null,
      }
      pointBuffer = [[round2(opt.scenePoint.x), round2(opt.scenePoint.y)]]
      flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
    }

    const onMouseMove = (opt) => {
      if (!strokeId || !opt.scenePoint) return
      pointBuffer.push([round2(opt.scenePoint.x), round2(opt.scenePoint.y)])
    }

    // Fires before object:added, so the serialized final op carries the id
    const onBeforePathCreated = ({ path }) => {
      if (strokeId) path._evoStrokeId = strokeId
    }

    const onMouseUp = () => {
      if (!strokeId) return
      flush()
      socket.emit('stroke_end', { roomCode, strokeId })
      clearInterval(flushTimer)
      flushTimer = null
      strokeId = null
      strokeStyle = null
      pointBuffer = []
    }

    // ── Receiver ──
    const previews = new Map() // strokeId → { points, obj, lastUpdate, removeTimer }

    const removePreview = (id) => {
      const entry = previews.get(id)
      if (!entry) return
      if (entry.removeTimer) clearTimeout(entry.removeTimer)
      if (entry.obj) canvas.remove(entry.obj)
      previews.delete(id)
      canvas.requestRenderAll()
    }

    const onStrokeProgress = ({ stroke }) => {
      if (!stroke?.id || !Array.isArray(stroke.points)) return
      let entry = previews.get(stroke.id)
      if (!entry) {
        entry = { points: [], obj: null, lastUpdate: 0, removeTimer: null }
        previews.set(stroke.id, entry)
      }
      entry.points.push(...stroke.points)
      entry.lastUpdate = Date.now()
      if (entry.points.length < 2) return

      // Recreate the polyline per batch — cheaper and safer than mutating
      // points (Fabric recalcs dimensions on construction, not on mutation)
      if (entry.obj) canvas.remove(entry.obj)
      const style = stroke.style || {}
      const poly = new fabric.Polyline(
        entry.points.map(([x, y]) => ({ x, y })),
        {
          fill: null,
          stroke: style.color || '#000000',
          strokeWidth: style.width || 5,
          strokeDashArray: style.dashArray || null,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
          evented: false,
          excludeFromExport: true,
          objectCaching: false,
        }
      )
      // Must be set BEFORE canvas.add so serializer/history guards see it
      poly._evoLivePreview = true
      entry.obj = poly
      canvas.add(poly)
      canvas.requestRenderAll()
    }

    // The final Path arrives via the normal canvas_op sync — swap it in
    const onObjectAdded = ({ target }) => {
      if (target?._evoStrokeId && previews.has(target._evoStrokeId)) {
        removePreview(target._evoStrokeId)
      }
    }

    const onStrokeEnd = ({ strokeId: id }) => {
      const entry = previews.get(id)
      if (!entry || entry.removeTimer) return
      entry.removeTimer = setTimeout(() => removePreview(id), END_GRACE_MS)
    }

    // Covers a lost stroke_end entirely (e.g. sender network drop)
    const sweepTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, entry] of previews) {
        if (now - entry.lastUpdate > STALE_AFTER_MS) removePreview(id)
      }
    }, STALE_SWEEP_MS)

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)
    canvas.on('before:path:created', onBeforePathCreated)
    canvas.on('object:added', onObjectAdded)
    socket.on('stroke_progress_received', onStrokeProgress)
    socket.on('stroke_end_received', onStrokeEnd)

    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
      canvas.off('before:path:created', onBeforePathCreated)
      canvas.off('object:added', onObjectAdded)
      socket.off('stroke_progress_received', onStrokeProgress)
      socket.off('stroke_end_received', onStrokeEnd)
      if (flushTimer) clearInterval(flushTimer)
      clearInterval(sweepTimer)
      for (const id of [...previews.keys()]) removePreview(id)
    }
  }, [canvas, roomCode, isConnected])
}
