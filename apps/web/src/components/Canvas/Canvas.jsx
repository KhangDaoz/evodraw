import { useRef, useEffect, useState } from 'react'
import * as fabric from 'fabric'
import './Canvas.css'

export default function Canvas({ activeTool, strokeColor, strokeWidth }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [fabricCanvas, setFabricCanvas] = useState(null)

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    // Initialize Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
      isDrawingMode: true,
      selection: true
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

    canvas.on('mouse:up', (opt) => {
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

  // Basic tool handling example
  useEffect(() => {
    if (!fabricCanvas) return
    
    if (activeTool === 'pen') {
      fabricCanvas.isDrawingMode = true
      if (!fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
      }
      fabricCanvas.freeDrawingBrush.color = strokeColor || '#000000'
      fabricCanvas.freeDrawingBrush.width = strokeWidth || 5
    } else {
      fabricCanvas.isDrawingMode = false
    }
  }, [fabricCanvas, activeTool, strokeColor, strokeWidth])

  return (
    <div className="evodraw-canvas-area" ref={containerRef}>
      <div className="canvas-dot-grid" />
      <canvas ref={canvasRef} className="draw-surface" />
    </div>
  )
}
