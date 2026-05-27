import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import useOverlayCanvas from '../../hooks/useOverlayCanvas'
import useDrawingTools from '../../hooks/useDrawingTools'
import useOverlayPanZoom from '../../hooks/useOverlayPanZoom'
import useHistory from '../../hooks/useHistory'
import useCanvasSync from '../../hooks/useCanvasSync'
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
  mode = 'working',
  onCanvasReady,
  roomId,
  isConnected,
  onUserViewport,
}, ref) => {
  const { fabricCanvas, containerRef, canvasRef } = useOverlayCanvas(screenSize)
  const syncState = useRef({ _applying: false })

  // Join the shared room canvas: load snapshot, send/receive canvas_op, push
  // periodic snapshots. Desktop overlay is just another viewport onto the
  // same scene — no overlay-specific protocol.
  useCanvasSync(fabricCanvas, syncState, roomId, isConnected, null, null, null)

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

  // Right-click drag to pan, wheel to zoom, "0" to reset — only in drawing mode.
  // onUserViewport fires when user manipulates viewport, so OverlayPage can
  // unlock its share-rect viewport lock.
  useOverlayPanZoom(fabricCanvas, mode, onUserViewport)

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
