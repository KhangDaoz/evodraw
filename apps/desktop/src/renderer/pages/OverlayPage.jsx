import { useState, useEffect, useCallback, useRef } from 'react'
import Canvas from '../components/Canvas/Canvas'
import Toolbar from '../components/Toolbar/Toolbar'
import ChatPanel from '../components/ChatPanel/ChatPanel'
import useRoom from '../hooks/useRoom'
import useChat from '../hooks/useChat'
import { getSocket } from '../services/socket'

const SYNCING_TOOLS = new Set(['pen', 'eraser', 'select'])

export default function OverlayPage({ roomInfo, serverUrl, screenSize, onLeave }) {
  const { roomId, username: initialUsername, shareId, displaySurface, captureX, captureY } = roomInfo
  const isOverlayMode = !!shareId
  console.log('[OverlayPage] mount', { roomId, shareId, isOverlayMode, screenSize })

  const canvasRef = useRef(null)
  const [fabricCanvas, setFabricCanvas] = useState(null)
  const [username, setUsername] = useState(initialUsername)

  // Tool state
  const [mode, setMode] = useState(isOverlayMode ? 'drawing' : 'working')
  const [activeTool, setActiveTool] = useState('pen')
  const [strokeColor, setStrokeColor] = useState('#e03131')
  const [strokeWidth, setStrokeWidth] = useState(5)
  const [strokeOpacity, setStrokeOpacity] = useState(1)
  const [strokeStyle, setStrokeStyle] = useState('solid')

  // Panel state
  const [chatOpen, setChatOpen] = useState(false)

  // Viewport lock to the share's proxy rect. Default ON when overlay launches
  // for a share. User pan/zoom unlocks; Snap button re-locks.
  const [viewportLocked, setViewportLocked] = useState(isOverlayMode)

  // Hooks
  const { isConnected, connectedUsers, error: roomError } =
    useRoom(serverUrl, roomId, username)
  const { messages, sendMessage } = useChat(roomId, username)

  const onCanvasReady = useCallback((fc) => setFabricCanvas(fc), [])

  // Auto-leave overlay when the presenter (web) stops the screen share.
  // Server broadcasts `screen:stopped { shareId }` to the room.
  useEffect(() => {
    if (!isOverlayMode || !isConnected) return
    const socket = getSocket()
    if (!socket) return
    const onStopped = ({ shareId: stoppedShareId }) => {
      if (stoppedShareId === shareId) {
        console.log('[OverlayPage] Presenter stopped sharing — leaving overlay')
        onLeave()
      }
    }
    socket.on('screen:stopped', onStopped)
    return () => socket.off('screen:stopped', onStopped)
  }, [isOverlayMode, isConnected, shareId, onLeave])

  // Notify web clients that the overlay has joined the room
  useEffect(() => {
    if (!isConnected || !isOverlayMode || !shareId) return
    const socket = getSocket()
    if (socket) socket.emit('overlay:ready', { roomId, shareId })
  }, [isConnected, isOverlayMode, roomId, shareId])

  // On mount: sync Electron window state with initial React mode
  useEffect(() => {
    const initialMode = isOverlayMode ? 'drawing' : 'working'
    window.electronAPI.setMode(initialMode)
    window.electronAPI.setIgnoreMouse(initialMode !== 'drawing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Receive mode changes from global hotkey (main → renderer)
  useEffect(() => {
    return window.electronAPI.onModeChange((m) => setMode(m))
  }, [])

  const toggleMode = useCallback(() => {
    const next = mode === 'drawing' ? 'working' : 'drawing'
    setMode(next)
    window.electronAPI.setMode(next)
    window.electronAPI.setIgnoreMouse(next !== 'drawing')
  }, [mode])

  // Lock viewport to the screen-share proxy rect so a stroke drawn at
  // scene-coord (px, py) inside the rect appears at the corresponding
  // pixel on the desktop's screen. Uses after:render polling since
  // applyRemoteOp mutates objects without firing 'object:modified'.
  useEffect(() => {
    if (!fabricCanvas || !shareId || !screenSize?.width || !screenSize?.height) return
    if (!viewportLocked) return

    let lastSig = null

    const findRect = () =>
      fabricCanvas.getObjects().find(o => o._evoScreenShare && o._evoShareId === shareId) || null

    const applyViewport = () => {
      const rect = findRect()
      if (!rect) return
      if (rect.selectable !== false) {
        rect.set({ selectable: false, evented: false, hasControls: false, hoverCursor: 'default' })
      }
      const w = rect.width * (rect.scaleX || 1)
      const h = rect.height * (rect.scaleY || 1)
      if (!w || !h) return
      const sig = `${rect.left.toFixed(2)},${rect.top.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`
      if (sig === lastSig) return
      lastSig = sig
      // For monitor captures the video spans the full screen, so use screenSize.
      // For window/browser the video spans only the captured area (rect.width × rect.height),
      // so use those dimensions to get the correct scale. captureX/Y offsets the translation
      // to account for where the capture area starts on the desktop screen.
      const captureW = displaySurface === 'monitor' ? screenSize.width : rect.width
      const captureH = displaySurface === 'monitor' ? screenSize.height : rect.height
      const sx = captureW / w
      const sy = captureH / h
      fabricCanvas.discardActiveObject?.()
      fabricCanvas.setViewportTransform([
        sx, 0, 0, sy,
        (captureX || 0) - rect.left * sx,
        (captureY || 0) - rect.top * sy,
      ])
      fabricCanvas.requestRenderAll()
    }

    applyViewport()
    fabricCanvas.on('after:render', applyViewport)
    fabricCanvas.on('object:added', applyViewport)
    fabricCanvas.on('object:removed', applyViewport)
    return () => {
      fabricCanvas.off('after:render', applyViewport)
      fabricCanvas.off('object:added', applyViewport)
      fabricCanvas.off('object:removed', applyViewport)
    }
  }, [fabricCanvas, shareId, screenSize, viewportLocked, displaySurface, captureX, captureY])

  const handleUserViewport = useCallback(() => setViewportLocked(false), [])
  const handleSnap = useCallback(() => setViewportLocked(true), [])

  const undo = useCallback(() => {
    canvasRef.current?.undo()
  }, [])

  const handleClearAll = useCallback(() => {
    if (!fabricCanvas) return
    fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas.remove(obj))
    fabricCanvas.requestRenderAll()
  }, [fabricCanvas])

  const handleLeave = useCallback(() => {
    onLeave()
  }, [onLeave])

  // Keyboard: Esc → select tool (Ctrl+Z is handled by useHistory + useDrawingTools)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') setActiveTool('select')
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  // Hover-to-interact: temporarily disable click-through over UI elements
  const onInteractiveEnter = () => window.electronAPI.setIgnoreMouse(false)
  const onInteractiveLeave = () => {
    if (mode === 'working') window.electronAPI.setIgnoreMouse(true)
  }

  const isDrawingActive = mode === 'drawing'
  const showLocalOnlyNote = isOverlayMode && !SYNCING_TOOLS.has(activeTool)

  // Auto-close chat when switching to working mode
  useEffect(() => {
    if (!isDrawingActive) setChatOpen(false)
  }, [isDrawingActive])

  return (
    <div className="overlay-root">
      <Canvas
        ref={canvasRef}
        screenSize={screenSize}
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeStyle={strokeStyle}
        isDrawingActive={isDrawingActive}
        mode={mode}
        onCanvasReady={onCanvasReady}
        roomId={roomId}
        isConnected={isConnected}
        onUserViewport={handleUserViewport}
      />

      <div className={`mode-indicator ${mode}`}>
        <span className="mode-dot" />
        <span>{mode === 'drawing' ? 'Drawing' : 'Working'}</span>
      </div>

      <Toolbar
        hidden={mode === 'working'}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        onColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onWidthChange={setStrokeWidth}
        strokeOpacity={strokeOpacity}
        onOpacityChange={setStrokeOpacity}
        strokeStyle={strokeStyle}
        onStyleChange={setStrokeStyle}
        onUndo={undo}
      >
        <div className="overlay-actions">
          <button className="tool-btn" title="Clear All" onClick={handleClearAll}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
          <button className="tool-btn exit-btn" title="Leave Room" onClick={handleLeave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {showLocalOnlyNote && (
          <div className="local-only-note">Local only</div>
        )}
      </Toolbar>

      {chatOpen && (
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          username={username}
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
        />
      )}

      {isDrawingActive && <button
        className={`chat-toggle-fab${chatOpen ? ' active' : ''}`}
        title="Toggle chat"
        onClick={() => setChatOpen(o => !o)}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>}

      <div
        className={`connection-status${isConnected ? ' connected' : roomError ? ' error' : ''}`}
      >
        <span className="conn-dot" />
        <span className="conn-text">
          {isConnected
            ? `${roomId} · ${connectedUsers.length + 1} online`
            : roomError || 'Connecting…'}
        </span>
      </div>

      {isOverlayMode && isDrawingActive && (
        <button
          className={`snap-fab${viewportLocked ? ' active' : ''}`}
          title="Snap viewport to screen-share rect"
          onClick={handleSnap}
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
          </svg>
        </button>
      )}

      <button
        className="mode-toggle-fab"
        title="Toggle drawing mode (Ctrl+Shift+D)"
        onClick={toggleMode}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      >
        {mode === 'drawing'
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
        }
      </button>
    </div>
  )
}
