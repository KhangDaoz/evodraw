import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import useOverlayCanvas from '../../hooks/useOverlayCanvas'
import useDrawingTools from '../../hooks/useDrawingTools'
import useHistory from '../../hooks/useHistory'
import './Canvas.css'

const Canvas = forwardRef(({
  screenSize,
  activeTool,
  onToolSelect,
  strokeColor,
  strokeWidth,
  strokeOpacity,
  strokeStyle,
  isDrawingActive = true,
  onCanvasReady,
}, ref) => {
  const { fabricCanvas, containerRef, canvasRef } = useOverlayCanvas(screenSize)
  const syncState = useRef({ _applying: false })

  // Local undo/redo for non-overlay flows; OverlayPage uses useOverlayEmit.undo for socket-aware undo.
  const { undo, redo } = useHistory(fabricCanvas, syncState)

  // Drawing tools: pen / eraser / shapes / line / arrow / text
  useDrawingTools(
    fabricCanvas,
    activeTool,
    onToolSelect,
    strokeColor,
    strokeWidth,
    strokeOpacity,
    strokeStyle
  )

  // Disable all interaction when not in drawing mode
  useEffect(() => {
    if (!fabricCanvas) return
    if (!isDrawingActive) {
      fabricCanvas.isDrawingMode = false
      fabricCanvas.selection = false
      fabricCanvas.skipTargetFind = true
      fabricCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false })
      fabricCanvas.requestRenderAll()
    }
  }, [fabricCanvas, isDrawingActive])

  // Notify parent when canvas is ready so it can attach socket emitters
  useEffect(() => {
    if (fabricCanvas && onCanvasReady) onCanvasReady(fabricCanvas)
  }, [fabricCanvas, onCanvasReady])

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    getFabricCanvas: () => fabricCanvas,
  }))

  return (
    <div className="evodraw-canvas-area" ref={containerRef} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="draw-surface" />
    </div>
  )
})

export default Canvas
