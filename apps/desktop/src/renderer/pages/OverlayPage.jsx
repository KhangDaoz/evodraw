import { useState, useEffect, useCallback, useRef } from 'react'
import Canvas from '../components/Canvas/Canvas'
import Toolbar from '../components/Toolbar/Toolbar'
import ChatPanel from '../components/ChatPanel/ChatPanel'
import SettingsPanel from '../components/SettingsPanel/SettingsPanel'
import useRoom from '../hooks/useRoom'
import useChat from '../hooks/useChat'
import useOverlayEmit from '../hooks/useOverlayEmit'
import { getSocket } from '../services/socket'

const SYNCING_TOOLS = new Set(['pen', 'eraser', 'select'])

export default function OverlayPage({ roomInfo, serverUrl, screenSize, onLeave }) {
  const { roomId, username: initialUsername, shareId } = roomInfo
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

  // Hooks
  const { isConnected, connectedUsers, error: roomError, updateUsername } =
    useRoom(serverUrl, roomId, username)
  const { messages, sendMessage } = useChat(roomId, username)
  const { undo: overlayUndo, clearAll: overlayClearAll, eraseStroke } =
    useOverlayEmit(isOverlayMode ? fabricCanvas : null, roomId, shareId, screenSize)

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

  // Eraser: in overlay mode, route through socket-aware eraseStroke for synced strokes
  useEffect(() => {
    if (!fabricCanvas || activeTool !== 'eraser' || mode !== 'drawing' || !isOverlayMode) return
    const onMouseDown = (opt) => {
      const target = fabricCanvas.findTarget(opt.e)
      if (!target) return
      if (target._evoOverlay) eraseStroke(target)
      // Non-overlay strokes (shapes, text, etc.) fall through to useDrawingTools' eraser
    }
    fabricCanvas.on('mouse:down', onMouseDown)
    return () => fabricCanvas.off('mouse:down', onMouseDown)
  }, [fabricCanvas, activeTool, mode, isOverlayMode, eraseStroke])

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

  const undo = useCallback(() => {
    if (isOverlayMode) {
      overlayUndo()
    } else {
      canvasRef.current?.undo()
    }
  }, [isOverlayMode, overlayUndo])

  const handleClearAll = useCallback(() => {
    if (isOverlayMode) {
      overlayClearAll()
    } else if (fabricCanvas) {
      fabricCanvas.getObjects().slice().forEach(obj => fabricCanvas.remove(obj))
      fabricCanvas.requestRenderAll()
    }
  }, [isOverlayMode, overlayClearAll, fabricCanvas])

  const handleLeave = useCallback(() => {
    onLeave()
  }, [onLeave])

  const handleUsernameChange = useCallback((next) => {
    setUsername(next)
    if (updateUsername) updateUsername(next)
  }, [updateUsername])

  // Keyboard: Esc → select tool (Ctrl+Z is handled by useHistory + useDrawingTools)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') setActiveTool('select')
      // Override Ctrl+Z in overlay mode to use socket-aware undo
      if (isOverlayMode && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        overlayUndo()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [isOverlayMode, overlayUndo])

  // Hover-to-interact: temporarily disable click-through over UI elements
  const onInteractiveEnter = () => window.electronAPI.setIgnoreMouse(false)
  const onInteractiveLeave = () => {
    if (mode === 'working') window.electronAPI.setIgnoreMouse(true)
  }

  const isDrawingActive = mode === 'drawing'
  const showLocalOnlyNote = isOverlayMode && !SYNCING_TOOLS.has(activeTool)

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
        onCanvasReady={onCanvasReady}
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

      <SettingsPanel
        roomCode={roomId}
        passcode={null}
        username={username}
        onUsernameChange={handleUsernameChange}
        onLeaveRoom={handleLeave}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      />

      {chatOpen && (
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          username={username}
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
        />
      )}

      <button
        className={`chat-toggle-fab${chatOpen ? ' active' : ''}`}
        title="Toggle chat"
        onClick={() => setChatOpen(o => !o)}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

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
