import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import { getSocket } from '../services/socket'

/**
 * When the local user is sharing their whole screen (displaySurface === 'monitor'),
 * relay fabric.Path objects that overlap the screen share proxy rect to the desktop
 * overlay via overlay:stroke:add / overlay:stroke:remove socket events.
 *
 * This lets the desktop overlay see web-canvas strokes drawn over the share tile —
 * fixing the case where the presenter's own overlay canvas doesn't show remote
 * strokes that collaborators drew on the web canvas.
 *
 * Coordinate normalization is the inverse of denormalizePath in useOverlayStrokes:
 * absolute canvas coords → normalized 0–1 relative to the proxy rect bounds.
 */
export default function useOverlayStrokeRelay(canvas, roomId, sharingShareId, sharingDisplaySurface) {
  // Map from fabric.Path instance -> strokeId string, for tracking relayed strokes
  const relayedRef = useRef(new Map())

  useEffect(() => {
    const active = sharingDisplaySurface === 'monitor' && canvas && roomId && sharingShareId
    if (!active) return

    const socket = getSocket()
    if (!socket) return

    // The proxy rect is added asynchronously (after the share video's metadata
    // loads), so it may not exist yet when this effect runs. Capture it lazily —
    // either it's already on the canvas, or object:added picks it up later.
    let proxyRect = null
    const relayed = relayedRef.current

    const isProxyRect = (obj) =>
      !!obj && obj._evoScreenShare && obj._evoShareId === sharingShareId

    /**
     * Normalize a fabric.Path's path array to 0-1 coordinates relative to the
     * proxy rect. Uses the path's transform matrix so moved/scaled paths map
     * correctly regardless of origin. Inverse of denormalizePath in useOverlayStrokes.
     */
    function normalizePathToRect(fabricPath) {
      const rectL = proxyRect.left
      const rectT = proxyRect.top
      const rectW = proxyRect.width * proxyRect.scaleX
      const rectH = proxyRect.height * proxyRect.scaleY
      const matrix = fabricPath.calcTransformMatrix()
      const { x: offX, y: offY } = fabricPath.pathOffset
      return fabricPath.path.map((segment) => {
        const out = [segment[0]] // SVG command letter
        for (let i = 1; i < segment.length; i += 2) {
          const abs = fabric.util.transformPoint(
            new fabric.Point(segment[i] - offX, segment[i + 1] - offY),
            matrix
          )
          out.push((abs.x - rectL) / rectW, (abs.y - rectT) / rectH)
        }
        return out
      })
    }

    /**
     * Returns true if obj is a plain fabric.Path that should be relayed.
     * Skips overlay strokes (desktop or local relay), screen share objects,
     * and images.
     */
    function shouldRelay(obj) {
      if (!obj || obj.type !== 'path') return false
      if (obj._evoScreenShare) return false
      if (obj._evoOverlayStroke) return false
      if (obj._evoOverlayLocal) return false
      if (obj._evoImage) return false
      return true
    }

    /** Check bounding rect intersection with the proxy rect. */
    function intersectsProxy(obj) {
      const bounds = obj.getBoundingRect()
      return obj.intersectsWithObject(proxyRect) ||
        proxyRect.containsPoint(new fabric.Point(bounds.left, bounds.top))
    }

    /** Emit a single path as an overlay stroke. */
    function relayPath(obj) {
      if (relayed.has(obj)) return // already relayed
      if (!intersectsProxy(obj)) return

      const rectW = proxyRect.width * proxyRect.scaleX
      const pathData = normalizePathToRect(obj)
      const strokeId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      relayed.set(obj, strokeId)

      socket.emit('overlay:stroke:add', {
        roomId,
        shareId: sharingShareId,
        stroke: {
          id: strokeId,
          pathData,
          color: obj.stroke,
          width: obj.strokeWidth / rectW,
          opacity: obj.opacity || 1,
          strokeLineCap: obj.strokeLineCap || 'round',
          strokeLineJoin: obj.strokeLineJoin || 'round',
        },
      })
    }

    /** Relay every qualifying path currently on the canvas. */
    function scanExisting() {
      for (const obj of canvas.getObjects()) {
        if (shouldRelay(obj)) relayPath(obj)
      }
    }

    const onObjectAdded = ({ target }) => {
      // The proxy rect arriving is our cue to scan pre-existing strokes.
      if (!proxyRect && isProxyRect(target)) {
        proxyRect = target
        scanExisting()
        return
      }
      if (proxyRect && shouldRelay(target)) relayPath(target)
    }

    // When an object is removed, remove its relay stroke from the desktop too.
    const onObjectRemoved = ({ target }) => {
      const strokeId = relayed.get(target)
      if (!strokeId) return
      relayed.delete(target)
      socket.emit('overlay:stroke:remove', { roomId, shareId: sharingShareId, strokeId })
    }

    canvas.on('object:added', onObjectAdded)
    canvas.on('object:removed', onObjectRemoved)

    // The proxy rect may already be present (e.g. effect re-run) — scan now.
    proxyRect = canvas.getObjects().find(isProxyRect) || null
    if (proxyRect) scanExisting()

    return () => {
      canvas.off('object:added', onObjectAdded)
      canvas.off('object:removed', onObjectRemoved)
      relayed.clear()
    }
  }, [canvas, roomId, sharingShareId, sharingDisplaySurface])
}
