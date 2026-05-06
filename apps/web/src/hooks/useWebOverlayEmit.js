import { useEffect, useRef } from 'react'
import { getSocket } from '../services/socket'

/**
 * Web-side counterpart of the desktop's `useOverlayEmit`.
 *
 * When a web user draws a pen stroke that lands inside a screen-share proxy
 * rect, the stroke is treated as an *overlay annotation* rather than a regular
 * canvas object. We:
 *   1. Tag the local Fabric path with `_evoOverlayStroke` + IDs (this also
 *      makes `canvasSerializer` skip the canvas_op emit, and makes the eraser
 *      from useDrawingTools route through `overlay:stroke:remove`).
 *   2. Normalize the path coordinates to 0–1 relative to the proxy rect.
 *   3. Emit `overlay:stroke:add` so all peers (other web canvases AND the
 *      presenter's desktop overlay) receive an anchored copy.
 *
 * The originator's local Fabric path stays at its literal cursor coordinates
 * (it does NOT follow the proxy rect when moved). This is a minor live UX
 * inconsistency — other peers see the anchored version, and on rejoin the
 * originator gets the anchored copy too. Fixing it requires re-creating the
 * local stroke as an anchored path; out of scope for this iteration.
 */
export default function useWebOverlayEmit(canvas, roomId) {
  const idCounterRef = useRef(0)

  useEffect(() => {
    if (!canvas || !roomId) return

    const findContainingShareRect = (path) => {
      // Path's bounding box in scene coordinates
      const left = path.left
      const top = path.top
      const right = left + path.width * (path.scaleX || 1)
      const bottom = top + path.height * (path.scaleY || 1)
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2

      // Iterate proxy rects on canvas
      for (const obj of canvas.getObjects()) {
        if (!obj._evoScreenShare) continue
        const rl = obj.left
        const rt = obj.top
        const rr = rl + obj.width * (obj.scaleX || 1)
        const rb = rt + obj.height * (obj.scaleY || 1)
        // Center-of-stroke contained → treat as drawn on this share
        if (cx >= rl && cx <= rr && cy >= rt && cy <= rb) return obj
      }
      return null
    }

    const normalizePath = (fabricPath, proxyRect) => {
      const rectW = proxyRect.width * (proxyRect.scaleX || 1)
      const rectH = proxyRect.height * (proxyRect.scaleY || 1)
      const rectL = proxyRect.left
      const rectT = proxyRect.top
      return fabricPath.path.map((segment) =>
        segment.map((val, i) => {
          if (i === 0) return val // SVG command letter
          const isX = i % 2 === 1
          return isX ? (val - rectL) / rectW : (val - rectT) / rectH
        })
      )
    }

    // Hook BEFORE the path is added to the canvas so we can tag it before
    // `object:added` fires. Otherwise canvasSerializer broadcasts a duplicate
    // canvas_op for the same stroke. Fabric's order:
    //   before:path:created → canvas.add(path) → object:added → path:created
    const onBeforePathCreated = ({ path }) => {
      if (path._evoOverlayStroke) return // already tagged
      const rect = findContainingShareRect(path)
      if (!rect) return // regular canvas stroke — normal flow

      const strokeId = `ws-${Date.now()}-${++idCounterRef.current}-${Math.random().toString(36).slice(2, 5)}`
      const shareId = rect._evoShareId

      path._evoOverlayStroke = true
      path._evoOverlayLocal = true
      path._evoShareId = shareId
      path._evoStrokeId = strokeId
      path.selectable = false
      path.evented = true
      path.hasControls = false
      path.hasBorders = false
    }

    const onPathCreated = ({ path }) => {
      if (!path._evoOverlayStroke || !path._evoOverlayLocal) return
      const shareId = path._evoShareId
      // Find the rect to normalize against (might have moved between
      // before:path:created and now — the bounding-box check already passed)
      const rect = canvas.getObjects().find(o => o._evoScreenShare && o._evoShareId === shareId)
      if (!rect) return

      const socket = getSocket()
      if (!socket?.connected) return

      const rectW = rect.width * (rect.scaleX || 1)
      const pathData = normalizePath(path, rect)

      socket.emit('overlay:stroke:add', {
        roomId,
        shareId,
        stroke: {
          id: path._evoStrokeId,
          pathData,
          color: typeof path.stroke === 'string' ? path.stroke : '#000000',
          width: (path.strokeWidth || 1) / rectW,
          opacity: path.opacity || 1,
        },
      })
    }

    canvas.on('before:path:created', onBeforePathCreated)
    canvas.on('path:created', onPathCreated)
    return () => {
      canvas.off('before:path:created', onBeforePathCreated)
      canvas.off('path:created', onPathCreated)
    }
  }, [canvas, roomId])
}
