import { useRef, useEffect, useState } from 'react'
import * as fabric from 'fabric'
import useCanvasSync from '../../hooks/useCanvasSync'
import './Canvas.css'

export default function Canvas({ activeTool, onToolSelect, strokeColor, strokeWidth, roomId }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [fabricCanvas, setFabricCanvas] = useState(null)

  // Real-time sync: serialize canvas ops ↔ socket
  useCanvasSync(fabricCanvas, roomId)

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    // Initialize Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
      isDrawingMode: true,
      selection: true,
      // Stroke-only hit detection: check actual pixels, not bounding box
      perPixelTargetFind: true,
      // Hit tolerance in px — user doesn't need pixel-perfect aim on thin strokes
      targetFindTolerance: 5,
    })

    setFabricCanvas(canvas)

    // Sync viewport to CSS variables for background dot grid
    const syncGrid = () => {
      if (!containerRef.current || !canvas) return

      const zoom = canvas.getZoom()
      const logZoom = Math.log2(zoom)
      const zoomLevel = Math.floor(logZoom)
      const zoomFract = logZoom - zoomLevel // 0.0 to 1.0 continuously

      // Calculate dynamic spacings for the fractal grid
      const spacingMain = 28 * Math.pow(2, zoomFract)
      const spacingSub = spacingMain / 2
      const opacitySub = zoomFract

      containerRef.current.style.setProperty('--spacing-main', `${spacingMain}px`)
      containerRef.current.style.setProperty('--spacing-sub', `${spacingSub}px`)
      containerRef.current.style.setProperty('--sub-opacity', opacitySub)

      const vpt = canvas.viewportTransform
      containerRef.current.style.setProperty('--pan-x', `${vpt[4]}px`)
      containerRef.current.style.setProperty('--pan-y', `${vpt[5]}px`)
      window.dispatchEvent(new CustomEvent('evodraw:zoom', { detail: zoom }))
    }

    // Handle Infinite Canvas: Zooming
    canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY
      let zoom = canvas.getZoom()
      zoom *= 0.999 ** delta
      if (zoom > 20) zoom = 20
      if (zoom < 0.05) zoom = 0.05

      canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom)
      syncGrid()

      opt.e.preventDefault()
      opt.e.stopPropagation()
    })

    // Handle Infinite Canvas: Panning
    let isDragging = false
    let lastPosX = 0
    let lastPosY = 0

    canvas.on('mouse:down', (opt) => {
      // Middle Click (button 1) or holding Space down (not easily captured here, but we can do middle click)
      if (opt.e.button === 1 || opt.e.altKey) {
        isDragging = true
        canvas.selection = false
        lastPosX = opt.e.clientX
        lastPosY = opt.e.clientY
        opt.e.preventDefault()
      }
    })

    canvas.on('mouse:move', (opt) => {
      if (isDragging) {
        const vpt = canvas.viewportTransform
        vpt[4] += opt.e.clientX - lastPosX
        vpt[5] += opt.e.clientY - lastPosY
        canvas.requestRenderAll()
        lastPosX = opt.e.clientX
        lastPosY = opt.e.clientY
        syncGrid()
      }
    })

    canvas.on('mouse:up', () => {
      if (isDragging) {
        canvas.setViewportTransform(canvas.viewportTransform)
        isDragging = false
        canvas.selection = true
      }
    })

    // Handle responsive resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || !entries.length) return
      const { width, height } = entries[0].contentRect
      canvas.setDimensions({ width, height })
    })
    resizeObserver.observe(containerRef.current)

    // Handle external zoom requests (from BottomBar)
    const handleZoomRequest = (e) => {
      let currentZoom = canvas.getZoom()
      if (e.detail === 'in') currentZoom *= 1.2
      else if (e.detail === 'out') currentZoom /= 1.2
      else if (e.detail === 'reset') {
        currentZoom = 1
        canvas.viewportTransform[4] = 0
        canvas.viewportTransform[5] = 0
      }

      if (currentZoom > 20) currentZoom = 20
      if (currentZoom < 0.05) currentZoom = 0.05

      const center = canvas.getVpCenter()
      canvas.zoomToPoint(new fabric.Point(center.x, center.y), currentZoom)
      canvas.requestRenderAll()
      syncGrid()
    }
    window.addEventListener('evodraw:request_zoom', handleZoomRequest)

    // Initial broadcast
    syncGrid()

    return () => {
      window.removeEventListener('evodraw:request_zoom', handleZoomRequest)
      resizeObserver.disconnect()
      canvas.dispose()
    }
  }, [])

  // Tool handling: pen, eraser, shapes, lines, arrows
  useEffect(() => {
    if (!fabricCanvas) return

    // --- Pen tool setup ---
    if (activeTool === 'pen') {
      // eslint-disable-next-line react-hooks/immutability
      fabricCanvas.isDrawingMode = true
      if (!fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
      }
      // eslint-disable-next-line react-hooks/immutability
      fabricCanvas.freeDrawingBrush.color = strokeColor || '#000000'
      fabricCanvas.freeDrawingBrush.width = strokeWidth || 5
    } else {
      fabricCanvas.isDrawingMode = false
    }

    // --- Selection state ---
    const canSelect = activeTool === 'select' || activeTool === 'hand'
    fabricCanvas.selection = canSelect
    fabricCanvas.skipTargetFind = !canSelect

    fabricCanvas.forEachObject(obj => {
      obj.set({ selectable: canSelect, evented: canSelect })
      obj.setCoords()
    })
    fabricCanvas.requestRenderAll()

    // --- Drawing state ---
    let drawing = false
    let shape = null
    let originX = 0
    let originY = 0

    const color = strokeColor || '#000000'
    const lineWidth = strokeWidth || 5

    // Scene-space pointer (respects zoom/pan)
    const scenePoint = (o) => {
      if (o.scenePoint) return o.scenePoint
      return fabricCanvas.getScenePoint(o.e)
    }

    // Viewport-space pointer (for bounding-rect hit-testing)
    const viewportPoint = (o) => fabricCanvas.getViewportPoint(o.e)

    // Bounding-rect hit test with stroke tolerance
    const hitTest = (obj, pt) => {
      const b = obj.getBoundingRect()
      const t = Math.max(10, (obj.strokeWidth || 0) * 2)
      return pt.x >= b.left - t && pt.x <= b.left + b.width + t &&
        pt.y >= b.top - t && pt.y <= b.top + b.height + t
    }

    // Erase topmost object at viewport point
    const eraseAt = (o) => {
      const pt = viewportPoint(o)
      const objs = fabricCanvas.getObjects()
      for (let i = objs.length - 1; i >= 0; i--) {
        if (hitTest(objs[i], pt)) {
          fabricCanvas.remove(objs[i])
          fabricCanvas.requestRenderAll()
          return
        }
      }
    }

    // Snap angle to nearest 45° increment
    const snapEndpoint = (dx, dy) => {
      const angle = Math.atan2(dy, dx)
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.sqrt(dx * dx + dy * dy)
      return { x: Math.cos(snapped) * len, y: Math.sin(snapped) * len }
    }

    // ─── MOUSE DOWN ───
    const onMouseDown = (o) => {
      if (fabricCanvas.isDrawingMode) return
      if (o.e.button === 1 || o.e.altKey) return
      if (canSelect) return

      drawing = true

      if (activeTool === 'eraser') { eraseAt(o); return }

      const pt = scenePoint(o)
      originX = pt.x
      originY = pt.y

      const base = {
        stroke: color,
        strokeWidth: lineWidth,
        fill: 'transparent',
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
        // Per-object override: only stroke pixels are clickable
        perPixelTargetFind: true,
      }

      switch (activeTool) {
        case 'rectangle':
        case 'frame':
          shape = new fabric.Rect({ left: originX, top: originY, width: 0, height: 0, ...base })
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'circle':
          shape = new fabric.Ellipse({ left: originX, top: originY, rx: 0, ry: 0, ...base })
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'line':
          shape = new fabric.Line([originX, originY, originX, originY], base)
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'arrow': {
          const line = new fabric.Line([originX, originY, originX, originY], base)
          line._evoDrawing = true
          const headSize = 10 + lineWidth * 1.5
          const head = new fabric.Triangle({
            width: headSize, height: headSize,
            fill: color,
            left: originX, top: originY,
            originX: 'center', originY: 'center',
            selectable: false, evented: false,
          })
          head._evoDrawing = true
          shape = { _arrow: true, line, head }
          fabricCanvas.add(line, head)
          break
        }
      }
    }

    // ─── MOUSE MOVE ───
    const onMouseMove = (o) => {
      if (!drawing) return

      if (activeTool === 'eraser') { eraseAt(o); return }
      if (!shape) return

      const pt = scenePoint(o)
      const shift = o.e.shiftKey

      switch (activeTool) {
        case 'rectangle':
        case 'frame':
        case 'circle': {
          let w = Math.abs(pt.x - originX)
          let h = Math.abs(pt.y - originY)

          if (shift) { const s = Math.max(w, h); w = s; h = s }

          const left = pt.x < originX ? originX - w : originX
          const top = pt.y < originY ? originY - h : originY

          if (activeTool === 'circle') {
            shape.set({ left, top, rx: w / 2, ry: h / 2 })
          } else {
            shape.set({ left, top, width: w, height: h })
          }
          break
        }

        case 'line': {
          let ex = pt.x, ey = pt.y
          if (shift) {
            const s = snapEndpoint(pt.x - originX, pt.y - originY)
            ex = originX + s.x; ey = originY + s.y
          }
          shape.set({ x2: ex, y2: ey })
          break
        }

        case 'arrow': {
          let ex = pt.x, ey = pt.y
          if (shift) {
            const s = snapEndpoint(pt.x - originX, pt.y - originY)
            ex = originX + s.x; ey = originY + s.y
          }
          shape.line.set({ x2: ex, y2: ey })
          const angle = (Math.atan2(ey - originY, ex - originX) * 180) / Math.PI
          shape.head.set({ left: ex, top: ey, angle: angle + 90 })
          break
        }
      }

      fabricCanvas.requestRenderAll()
    }

    // ─── MOUSE UP ───
    const onMouseUp = (o) => {
      if (!drawing) return
      drawing = false

      if (activeTool === 'eraser') return

      // Finalize arrow: replace loose line+triangle with a clean Group
      if (shape?._arrow) {
        const pt = scenePoint(o)
        const dx = pt.x - originX
        const dy = pt.y - originY
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI

        fabricCanvas.remove(shape.line, shape.head)

        if (len > 2) {
          const shaft = new fabric.Line([0, 0, len, 0], {
            stroke: color, strokeWidth: lineWidth, strokeLineCap: 'round',
          })
          const headLen = 15 + lineWidth
          const tip = new fabric.Polygon([
            { x: len, y: 0 },
            { x: len - headLen, y: -headLen / 2 },
            { x: len - headLen, y: headLen / 2 },
          ], { fill: color })

          const group = new fabric.Group([shaft, tip], {
            left: originX, top: originY, angle,
            originX: 'left', originY: 'center',
            selectable: false, evented: false,
            perPixelTargetFind: true,
          })
          fabricCanvas.add(group)
        }

        fabricCanvas.requestRenderAll()
      } else if (shape) {
        // Finalize non-arrow shape: clear drawing flag, emit final state
        delete shape._evoDrawing
        fabricCanvas.fire('object:added', { target: shape })
      }

      shape = null

      // Auto-switch to select mode after drawing
      if (['rectangle', 'frame', 'circle', 'line', 'arrow'].includes(activeTool) && onToolSelect) {
        onToolSelect('select')
      }
    }

    fabricCanvas.on('mouse:down', onMouseDown)
    fabricCanvas.on('mouse:move', onMouseMove)
    fabricCanvas.on('mouse:up', onMouseUp)

    return () => {
      fabricCanvas.off('mouse:down', onMouseDown)
      fabricCanvas.off('mouse:move', onMouseMove)
      fabricCanvas.off('mouse:up', onMouseUp)
    }
  }, [fabricCanvas, activeTool, onToolSelect, strokeColor, strokeWidth])

  return (
    <div className="evodraw-canvas-area" ref={containerRef}>
      <div className="canvas-dot-grid" />
      <canvas ref={canvasRef} className="draw-surface" />
    </div>
  )
}
