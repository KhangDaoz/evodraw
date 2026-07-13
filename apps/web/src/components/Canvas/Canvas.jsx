import useInfiniteCanvas from '../../hooks/useInfiniteCanvas'
import useCanvasSync from '../../hooks/useCanvasSync'
import useLiveStrokes from '../../hooks/useLiveStrokes'
import useDrawingTools from '../../hooks/useDrawingTools'
import useRemoteCursors from '../../hooks/useRemoteCursors'
import useHistory from '../../hooks/useHistory'
import useImagePasting from '../../hooks/useImagePasting'

import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react'
import { getCanvasStyle } from '../../utils/theme'
import './Canvas.css'

const Canvas = forwardRef(({ activeTool, onToolSelect, strokeColor, strokeWidth, strokeOpacity, strokeStyle, roomCode, username, isConnected, canvasBgColor, canvasBgId, onBgColorChange, syncState: externalSyncState }, ref) => {
  const { fabricCanvas, containerRef, canvasRef } = useInfiniteCanvas(activeTool)
  const internalSyncState = useRef({ _applying: false })
  const syncState = externalSyncState || internalSyncState
  const screenShareLayerRef = useRef(null)

  // Canvas background pattern (dots/grid/none) — device-local preference,
  // broadcast from SettingsPanel via a window event (no prop drilling)
  const [canvasStyle, setCanvasStyle] = useState(getCanvasStyle)
  useEffect(() => {
    const handler = (e) => setCanvasStyle(e.detail)
    window.addEventListener('evodraw:canvas_style', handler)
    return () => window.removeEventListener('evodraw:canvas_style', handler)
  }, [])

  // Real-time sync: serialize canvas ops ↔ socket
  useCanvasSync(fabricCanvas, syncState, roomCode, isConnected, canvasBgColor, canvasBgId, onBgColorChange)

  // Live in-progress stroke previews (send + receive)
  useLiveStrokes(fabricCanvas, roomCode, isConnected)

  // Undo/Redo tracking
  const { undo, redo } = useHistory(fabricCanvas, syncState)

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    getFabricCanvas: () => fabricCanvas,
    getScreenShareLayer: () => screenShareLayerRef.current,
  }))

  // Image pasting support
  useImagePasting(fabricCanvas, containerRef, roomCode)

  // Tool handling: pen, eraser, shapes, lines, arrows, text
  useDrawingTools(
    fabricCanvas,
    activeTool,
    onToolSelect,
    strokeColor,
    strokeWidth,
    strokeOpacity,
    strokeStyle
  )

  // Remote cursor sync + coordinate conversion
  const { remoteCursors, sceneToScreen, viewportVersion, getCursorColor } =
    useRemoteCursors(fabricCanvas, roomCode, username, isConnected)

  return (
    <div className="evodraw-canvas-area" ref={containerRef} onContextMenu={(e) => e.preventDefault()}>
      <div
        className={`canvas-dot-grid canvas-style-${canvasStyle}`}
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

