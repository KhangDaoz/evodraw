import useInfiniteCanvas from '../../hooks/useInfiniteCanvas'
import useCanvasSync from '../../hooks/useCanvasSync'
import useDrawingTools from '../../hooks/useDrawingTools'
import useRemoteCursors from '../../hooks/useRemoteCursors'
import useHistory from '../../hooks/useHistory'
import useImagePasting from '../../hooks/useImagePasting'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import './Canvas.css'

const Canvas = forwardRef(({ activeTool, onToolSelect, strokeColor, strokeWidth, strokeOpacity, strokeStyle, roomId, username, isConnected, canvasBgColor, canvasBgId, onBgColorChange }, ref) => {
  const { fabricCanvas, containerRef, canvasRef } = useInfiniteCanvas()
  const syncState = useRef({ _applying: false })
  const screenShareLayerRef = useRef(null)

  // Real-time sync: serialize canvas ops ↔ socket
  useCanvasSync(fabricCanvas, syncState, roomId, isConnected, canvasBgColor, canvasBgId, onBgColorChange)

  // Undo/Redo tracking
  const { undo, redo } = useHistory(fabricCanvas, syncState)

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    getFabricCanvas: () => fabricCanvas,
    getScreenShareLayer: () => screenShareLayerRef.current,
  }))

  // Image pasting support
  useImagePasting(fabricCanvas, containerRef, roomId)

  // Tool handling: pen, eraser, shapes, lines, arrows, text
  useDrawingTools(fabricCanvas, activeTool, onToolSelect, strokeColor, strokeWidth, strokeOpacity, strokeStyle)

  // Remote cursor sync + coordinate conversion
  const { remoteCursors, sceneToScreen, viewportVersion, getCursorColor } =
    useRemoteCursors(fabricCanvas, roomId, username, isConnected)

  return (
    <div className="evodraw-canvas-area" ref={containerRef} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="canvas-dot-grid"
        style={canvasBgColor ? { backgroundColor: canvasBgColor } : undefined}
      />
      <div className="screen-share-layer" ref={screenShareLayerRef} />
      <canvas ref={canvasRef} className="draw-surface" />

      {/* Remote cursor overlays */}
      {Object.entries(remoteCursors).map(([user, pos]) => {
        const screen = sceneToScreen(pos.x, pos.y, viewportVersion)
        const color = getCursorColor(user)
        return (
          <div
            key={user}
            className="remote-cursor"
            style={{
              left: screen.x,
              top: screen.y,
              '--cursor-color': color,
            }}
          >
            <svg
              className="remote-cursor-arrow"
              width="16" height="20" viewBox="0 0 16 20"
              fill={color} stroke="#fff" strokeWidth="1.2"
            >
              <path d="M0 0 L16 12 L8 12 L6 20 Z" />
            </svg>
            <span className="remote-cursor-label" style={{ background: color }}>
              {user}
            </span>
          </div>
        )
      })}
    </div>
  )
})

export default Canvas

