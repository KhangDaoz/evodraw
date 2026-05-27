import { useEffect, useCallback, useRef } from 'react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Pan/zoom controller for the overlay canvas. Only active in drawing mode.
 *   - Right-click + drag → pan (viewportTransform[4]/[5])
 *   - Wheel             → zoom around cursor, clamped to [0.25, 4]
 *   - "0" key           → reset viewport to identity (snap-back without leaving drawing mode)
 *
 * Working mode is "fullscreen-locked" — the consumer is responsible for
 * resetting the viewport when switching modes; this hook only attaches
 * gesture listeners.
 */
export default function useOverlayPanZoom(fabricCanvas, mode, onUserViewport) {
  const resetView = useCallback(() => {
    if (!fabricCanvas) return
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    fabricCanvas.requestRenderAll()
  }, [fabricCanvas])

  const onUserViewportRef = useRef(onUserViewport)
  useEffect(() => { onUserViewportRef.current = onUserViewport }, [onUserViewport])

  const panStateRef = useRef(null)

  useEffect(() => {
    if (!fabricCanvas) return
    if (mode !== 'drawing') return

    const upperEl = fabricCanvas.upperCanvasEl
    if (!upperEl) return

    const onWheel = (e) => {
      e.preventDefault()
      const vpt = fabricCanvas.viewportTransform
      const currentZoom = vpt[0]
      const factor = 1 - e.deltaY * 0.001
      const newZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (newZoom === currentZoom) return
      const point = fabricCanvas.getScenePoint(e)
      fabricCanvas.zoomToPoint(point, newZoom)
      onUserViewportRef.current?.()
    }

    const onWindowMouseMove = (e) => {
      const s = panStateRef.current
      if (!s) return
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      const vpt = fabricCanvas.viewportTransform.slice()
      vpt[4] = s.startPanX + dx
      vpt[5] = s.startPanY + dy
      fabricCanvas.setViewportTransform(vpt)
      fabricCanvas.requestRenderAll()
    }

    const stopPan = () => {
      if (!panStateRef.current) return
      panStateRef.current = null
      upperEl.style.cursor = ''
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', stopPan)
    }

    const onMouseDown = (e) => {
      if (e.button !== 2) return
      e.preventDefault()
      const vpt = fabricCanvas.viewportTransform
      panStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: vpt[4],
        startPanY: vpt[5],
      }
      upperEl.style.cursor = 'grabbing'
      window.addEventListener('mousemove', onWindowMouseMove)
      window.addEventListener('mouseup', stopPan)
      onUserViewportRef.current?.()
    }

    const onContextMenu = (e) => e.preventDefault()

    const onKeyDown = (e) => {
      if (e.key !== '0') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      resetView()
      onUserViewportRef.current?.()
    }

    upperEl.addEventListener('wheel', onWheel, { passive: false })
    upperEl.addEventListener('mousedown', onMouseDown)
    upperEl.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      upperEl.removeEventListener('wheel', onWheel)
      upperEl.removeEventListener('mousedown', onMouseDown)
      upperEl.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      stopPan()
    }
  }, [fabricCanvas, mode, resetView])

  return { resetView }
}
