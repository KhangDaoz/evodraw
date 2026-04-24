import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom'
import useRoom from '../../hooks/useRoom'
import useChat from '../../hooks/useChat'
import useLiveKitRoom from '../../hooks/useLiveKitRoom'
import useVoiceChat from '../../hooks/useVoiceChat'
import useScreenShare from '../../hooks/useScreenShare'
import useScreenShareControls from '../../hooks/useScreenShareControls'
import { getSocket } from '../../services/socket'
import Toolbar from '../../components/Toolbar/Toolbar'
import BottomBar from '../../components/BottomBar/BottomBar'
import Canvas from '../../components/Canvas/Canvas'
import SettingsPanel, { BG_PRESETS, resolveTheme } from '../../components/SettingsPanel/SettingsPanel'
import MembersPanel from '../../components/MembersPanel/MembersPanel'
import ChatPanel from '../../components/ChatPanel/ChatPanel'
import { generateAnonymousName } from '../../utils/nameGenerator'
import './RoomPage.css'

export default function RoomPage() {
  const { roomCode } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [username, setUsername] = useState(() => location.state?.username || localStorage.getItem('evodraw_username') || generateAnonymousName())
  const [passcode] = useState(location.state?.passcode || '')
  const [activeTool, setActiveTool] = useState('pen')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(5)
  const [strokeOpacity, setStrokeOpacity] = useState(1)
  const [strokeStyle, setStrokeStyle] = useState('solid')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [toastMessage, setToastMessage] = useState(null)
  const unreadTimerRef = useRef(null)
  const prevMessagesLengthRef = useRef(0)
  const canvasRef = useRef(null)
  const chatPanelRef = useRef(null)
  const chatToggleBtnRef = useRef(null)

  // Canvas background: compute initial color based on theme
  const [canvasBgId, setCanvasBgId] = useState('default')
  const [canvasBgColor, setCanvasBgColor] = useState(() => {
    const theme = localStorage.getItem('evodraw_theme') || 'light'
    const resolved = resolveTheme(theme)
    const preset = BG_PRESETS.find(p => p.id === 'default') || BG_PRESETS[0]
    return preset[resolved]
  })

  // Theme tracking for responding to syncs correctly
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('evodraw_theme') || 'light')

  // Listen to local storage theme changes (set by SettingsPanel) to keep currentTheme fresh
  useEffect(() => {
    const handleStorage = () => {
      setCurrentTheme(localStorage.getItem('evodraw_theme') || 'light')
    }
    window.addEventListener('storage', handleStorage)

    // Also set up a mutation observer on the HTML data-theme attribute
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newTheme = document.documentElement.getAttribute('data-theme')
          setCurrentTheme(newTheme || 'light')
        }
      })
    })
    observer.observe(document.documentElement, { attributes: true })

    return () => {
      window.removeEventListener('storage', handleStorage)
      observer.disconnect()
    }
  }, [])

  // Clear passcode from history securely
  useEffect(() => {
    if (location.state?.passcode) {
      const timer = setTimeout(() => {
        navigate('.', { replace: true, state: { ...location.state, passcode: '' } })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [navigate, location.state])

  const { isConnected, connectedUsers, error, updateUsername } = useRoom(roomCode, username, passcode)
  const { messages, sendMessage } = useChat(roomCode, username)

  // LiveKit Room — shared media transport for voice chat and screen share
  const { room } = useLiveKitRoom(roomCode, username)
  const { isVoiceActive, toggleVoice, streams } = useVoiceChat(room)

  // Screen share — needs fabricCanvas and screenShareLayer from canvas ref
  const [fabricCanvas, setFabricCanvas] = useState(null)
  const [screenShareLayer, setScreenShareLayer] = useState(null)
  const screenShareHook = useScreenShare(
    roomCode, username, isConnected, fabricCanvas, room, screenShareLayer
  )
  const { isSharing, activeShares } = screenShareHook

  // Screen share UI controls (resolution, fps, audio)
  const {
    screenResolution, screenAudio, screenFps,
    handleToggle: handleScreenShareToggle,
    handleResolutionChange, handleFpsChange, handleToggleAudio,
  } = useScreenShareControls(screenShareHook)

  // Keep fabricCanvas and screenShareLayer in sync when canvas ref mounts
  useEffect(() => {
    const fc = canvasRef.current?.getFabricCanvas()
    if (fc && fc !== fabricCanvas) setFabricCanvas(fc)
    const ssl = canvasRef.current?.getScreenShareLayer()
    if (ssl && ssl !== screenShareLayer) setScreenShareLayer(ssl)
  })

  // Sync fabricCanvas and screenShareLayer after initial render when canvas ref is available
  useEffect(() => {
    const timer = setTimeout(() => {
      const fc = canvasRef.current?.getFabricCanvas()
      if (fc && fc !== fabricCanvas) setFabricCanvas(fc)
      const ssl = canvasRef.current?.getScreenShareLayer()
      if (ssl && ssl !== screenShareLayer) setScreenShareLayer(ssl)
    }, 100)
    return () => clearTimeout(timer)
  }, [fabricCanvas, screenShareLayer])

  // Canvas Background Color sync — listen for remote changes
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !isConnected) return

    const handleBgChanged = ({ bgId, bgColor }) => {
      if (bgId) {
        setCanvasBgId(bgId)
        const effectiveTheme = resolveTheme(document.documentElement.getAttribute('data-theme') || 'light')
        const preset = BG_PRESETS.find(p => p.id === bgId) || BG_PRESETS[0]
        setCanvasBgColor(preset[effectiveTheme])
      } else if (bgColor) {
        setCanvasBgColor(bgColor)
      }
    }

    socket.on('canvas_bg_changed', handleBgChanged)
    return () => { socket.off('canvas_bg_changed', handleBgChanged) }
  }, [isConnected])

  // Track unread messages and display toast when chat is closed
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMsg = messages[messages.length - 1]
      if (!isChatOpen && newMsg.sender !== username && !newMsg.system) {
        setUnreadCount(prev => prev + 1)
        setToastMessage(newMsg)

        if (unreadTimerRef.current) clearTimeout(unreadTimerRef.current)
        unreadTimerRef.current = setTimeout(() => {
          setToastMessage(null)
        }, 4000)
      }
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages, isChatOpen, username])

  // Clear unread count when opening chat
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0)
      setToastMessage(null)
      if (unreadTimerRef.current) clearTimeout(unreadTimerRef.current)
    }
  }, [isChatOpen])

  // Close Messages popup when clicking outside of panel/toggle button.
  useEffect(() => {
    if (!isChatOpen) return

    const handleOutsideClick = (e) => {
      if (chatPanelRef.current?.contains(e.target)) return
      if (chatToggleBtnRef.current?.contains(e.target)) return
      setIsChatOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isChatOpen])

  // Called by SettingsPanel when user picks a swatch or changes theme
  const handleBgChange = useCallback((bgId, bgColor) => {
    setCanvasBgId(bgId)
    setCanvasBgColor(bgColor)
    const socket = getSocket()
    if (socket && roomCode) {
      socket.emit('canvas_bg_change', { roomId: roomCode, bgId, bgColor })
    }
  }, [roomCode])

  if (!passcode) {
    return <Navigate to="/" state={{ roomCode, error: 'Please enter the room passcode' }} replace />
  }

  if (error && error.includes('Access Denied')) {
    return <Navigate to="/" state={{ roomCode, error }} replace />
  }

  if (!username) {
    return <Navigate to="/" replace />
  }

  const handleLeaveRoom = () => {
    navigate('/', { replace: true })
  }

  const handleUsernameChange = (newName) => {
    setUsername(newName)
    localStorage.setItem('evodraw_username', newName)
    updateUsername(newName)
  }

  return (
    <div className="room-page">
      <Canvas
        ref={canvasRef}
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeStyle={strokeStyle}
        roomId={roomCode}
        username={username}
        isConnected={isConnected}
        canvasBgColor={canvasBgColor}
        canvasBgId={canvasBgId}
        onBgColorChange={(bgId, color) => {
          if (bgId) {
            setCanvasBgId(bgId)
            const effectiveTheme = resolveTheme(document.documentElement.getAttribute('data-theme') || 'light')
            const preset = BG_PRESETS.find(p => p.id === bgId) || BG_PRESETS[0]
            setCanvasBgColor(preset[effectiveTheme])
          } else if (color) {
            setCanvasBgColor(color)
          }
        }}
      />

      <Toolbar
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
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        showHint={false}
        isVoiceActive={isVoiceActive}
        onToggleVoice={toggleVoice}
        isScreenSharing={isSharing}
        activeShareCount={activeShares.size}
        onToggleScreenShare={handleScreenShareToggle}
        screenResolution={screenResolution}
        onChangeResolution={handleResolutionChange}
        screenAudio={screenAudio}
        onToggleScreenAudio={handleToggleAudio}
        screenFps={screenFps}
        onChangeFps={handleFpsChange}
      />

      {/* Status bar */}
      <div className="room-status-bar">
        <div className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <MembersPanel
          currentUser={username}
          connectedUsers={connectedUsers}
          isConnected={isConnected}
        />
      </div>

      <SettingsPanel
        roomCode={roomCode}
        passcode={passcode}
        onLeaveRoom={handleLeaveRoom}
        username={username}
        onUsernameChange={handleUsernameChange}
        canvasBgId={canvasBgId}
        onBgChange={handleBgChange}
      />

      {error && (
        <div className="room-error-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isChatOpen && (
        <div ref={chatPanelRef}>
          <ChatPanel
            messages={messages}
            onSendMessage={sendMessage}
            username={username}
          />
        </div>
      )}

      <button
        ref={chatToggleBtnRef}
        className={`chat-toggle-btn ${isChatOpen ? 'active' : ''}`}
        onClick={() => setIsChatOpen(!isChatOpen)}
        title="Toggle Chat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        {unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
      </button>

      {/* Toast Notification */}
      {toastMessage && !isChatOpen && (
        <div className="chat-toast" onClick={() => setIsChatOpen(true)}>
          <div className="chat-toast-header">
            <strong>{toastMessage.sender}</strong>
            <span>Just now</span>
          </div>
          <div className="chat-toast-body">{toastMessage.text}</div>
        </div>
      )}

      <div style={{ display: 'none' }}>
        {Object.entries(streams).map(([socketId, stream]) => (
          <audio
            key={socketId}
            autoPlay
            ref={audio => {
              if (audio && audio.srcObject !== stream) {
                audio.srcObject = stream
              }
            }}
          />
        ))}
      </div>

      <BottomBar />
    </div>
  )
}
