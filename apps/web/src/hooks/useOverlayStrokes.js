import { useState, useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import { getSocket } from '../services/socket'

/**
 * Receives overlay strokes from the desktop overlay app and renders them
 * on the web canvas, positioned relative to the screen share proxy rect.
 *
 * Strokes arrive with normalized coordinates (0–1) and are mapped to the
 * proxy rect's position and dimensions on the canvas.
 */
export default function useOverlayStrokes(canvas, roomId, isConnected) {
  const strokeMapRef = useRef(new Map()) // shareId → Map(strokeId → fabricObj)
  const [annotatingUser, setAnnotatingUser] = useState(null)
  const annotatingTimerRef = useRef(null)

  // Find the screen share proxy rect on the canvas by shareId
  const findProxyRect = useCallback(
    (shareId) => {
      if (!canvas) return null
      return canvas.getObjects().find(
        (obj) => obj._evoScreenShare && obj._evoShareId === shareId
      )
    },
    [canvas]
  )

  // Convert normalized path data (0–1) to canvas coordinates relative to proxy rect
  const denormalizePath = useCallback(
    (pathData, proxyRect) => {
      if (!proxyRect) return null

      const rectW = proxyRect.width * proxyRect.scaleX
      const rectH = proxyRect.height * proxyRect.scaleY
      const rectL = proxyRect.left
      const rectT = proxyRect.top

      return pathData.map((segment) =>
        segment.map((val, i) => {
          if (i === 0) return val // command letter
          const isX = i % 2 === 1
          return isX ? rectL + val * rectW : rectT + val * rectH
        })
      )
    },
    []
  )

  // Create a Fabric path from a normalized overlay stroke
  const createStrokeObject = useCallback(
    (stroke, proxyRect) => {
      if (!proxyRect) return null

      const rectW = proxyRect.width * proxyRect.scaleX
      const rectH = proxyRect.height * proxyRect.scaleY

      if (stroke.type === 'arrow') {
        // Arrow: two normalized points
        const [p1, p2] = stroke.pathData
        const x1 = proxyRect.left + p1[0] * rectW
        const y1 = proxyRect.top + p1[1] * rectH
        const x2 = proxyRect.left + p2[0] * rectW
        const y2 = proxyRect.top + p2[1] * rectH

        const line = new fabric.Line([x1, y1, x2, y2], {
          stroke: stroke.color,
          strokeWidth: Math.max(1, stroke.width * rectW),
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          opacity: stroke.opacity || 1,
        })

        line._evoOverlayStroke = true
        line._evoStrokeId = stroke.id
        line._evoShareId = proxyRect._evoShareId
        line._evoOriginalStroke = stroke
        return line
      }

      // Default: path (pen, highlighter)
      const denormalized = denormalizePath(stroke.pathData, proxyRect)
      if (!denormalized) return null

      // Build SVG path string
      const svgPath = denormalized
        .map((seg) => seg.join(' '))
        .join(' ')

      try {
        const path = new fabric.Path(svgPath, {
          stroke: stroke.color,
          strokeWidth: Math.max(1, stroke.width * rectW),
          fill: null,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          opacity: stroke.opacity || 1,
        })

        path._evoOverlayStroke = true
        path._evoStrokeId = stroke.id
        path._evoShareId = proxyRect._evoShareId
        path._evoOriginalStroke = stroke
        return path
      } catch (err) {
        console.error('[OverlayStrokes] Failed to create path:', err)
        return null
      }
    },
    [denormalizePath]
  )

  // Remove all strokes for a given shareId
  const clearStrokesForShare = useCallback(
    (shareId) => {
      if (!canvas) return
      const strokes = strokeMapRef.current.get(shareId)
      if (!strokes) return

      for (const [, obj] of strokes) {
        canvas.remove(obj)
      }
      strokes.clear()
      canvas.requestRenderAll()
    },
    [canvas]
  )

  useEffect(() => {
    if (!canvas || !roomId || !isConnected) return

    const socket = getSocket()
    if (!socket) return

    // ── Stroke Added ──
    const onStrokeAdded = ({ shareId, stroke, username: presenterName }) => {
      const proxyRect = findProxyRect(shareId)
      if (!proxyRect) {
        console.warn('[OverlayStrokes] No proxy rect for shareId:', shareId)
        return
      }

      const fabricObj = createStrokeObject(stroke, proxyRect)
      if (!fabricObj) return

      // Store reference
      if (!strokeMapRef.current.has(shareId)) {
        strokeMapRef.current.set(shareId, new Map())
      }
      strokeMapRef.current.get(shareId).set(stroke.id, fabricObj)

      canvas.add(fabricObj)
      canvas.requestRenderAll()

      setAnnotatingUser(presenterName)
      if (annotatingTimerRef.current) clearTimeout(annotatingTimerRef.current)
      annotatingTimerRef.current = setTimeout(() => {
        setAnnotatingUser(null)
      }, 3000)
    }

    // ── Stroke Removed ──
    const onStrokeRemoved = ({ shareId, strokeId }) => {
      const strokes = strokeMapRef.current.get(shareId)
      if (!strokes) return

      const obj = strokes.get(strokeId)
      if (obj) {
        canvas.remove(obj)
        strokes.delete(strokeId)
        canvas.requestRenderAll()
      }
    }

    // ── All Strokes Cleared ──
    const onStrokeCleared = ({ shareId }) => {
      clearStrokesForShare(shareId)
    }

    // ── Screen Share Stopped → cleanup overlay strokes ──
    const onScreenStopped = ({ shareId }) => {
      clearStrokesForShare(shareId)
      strokeMapRef.current.delete(shareId)
    }

    socket.on('overlay:stroke:added', onStrokeAdded)
    socket.on('overlay:stroke:removed', onStrokeRemoved)
    socket.on('overlay:stroke:cleared', onStrokeCleared)
    socket.on('screen:stopped', onScreenStopped)

    return () => {
      socket.off('overlay:stroke:added', onStrokeAdded)
      socket.off('overlay:stroke:removed', onStrokeRemoved)
      socket.off('overlay:stroke:cleared', onStrokeCleared)
      socket.off('screen:stopped', onScreenStopped)
    }
  }, [canvas, roomId, isConnected, findProxyRect, createStrokeObject, clearStrokesForShare])

  // Reposition overlay strokes when proxy rect moves/scales
  useEffect(() => {
    if (!canvas) return

    const onObjectModified = ({ target }) => {
      if (!target?._evoScreenShare) return

      const shareId = target._evoShareId
      const strokes = strokeMapRef.current.get(shareId)
      if (!strokes || strokes.size === 0) return

      // Remove old strokes and re-render at new position
      for (const [strokeId, obj] of strokes) {
        const originalStroke = obj._evoOriginalStroke
        canvas.remove(obj)
        if (originalStroke) {
          const newObj = createStrokeObject(originalStroke, target)
          if (newObj) {
            strokes.set(strokeId, newObj)
            canvas.add(newObj)
          } else {
            strokes.delete(strokeId)
          }
        } else {
          strokes.delete(strokeId)
        }
      }
      canvas.requestRenderAll()
    }

    canvas.on('object:modified', onObjectModified)
    return () => canvas.off('object:modified', onObjectModified)
  }, [canvas, createStrokeObject])

  return { annotatingUser }
}
