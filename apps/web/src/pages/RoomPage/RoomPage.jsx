import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom'
import useRoom from '../../hooks/useRoom'
import useChat from '../../hooks/useChat'
import useVoiceChat from '../../hooks/useVoiceChat'
import useScreenShare from '../../hooks/useScreenShare'
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

  // Shared WebRTC peer connection pool (used by both voice chat and screen share)
  const peersRef = useRef({})
  const { isVoiceActive, toggleVoice, streams } = useVoiceChat(roomCode, username, peersRef)

  // Screen share — needs fabricCanvas from canvas ref
  const [fabricCanvas, setFabricCanvas] = useState(null)
  const { isSharing, activeShares, startSharing, stopSharing } = useScreenShare(
    roomCode, username, isConnected, fabricCanvas, peersRef
  )

  // Keep fabricCanvas in sync when canvas ref mounts
  useEffect(() => {
    const fc = canvasRef.current?.getFabricCanvas()
    if (fc && fc !== fabricCanvas) setFabricCanvas(fc)
  })

  // Canvas Background Color sync — listen for remote changes
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !isConnected) return

    const handleBgChanged = ({ bgId, bgColor }) => {
      if (bgId) {
        setCanvasBgId(bgId)
        // Resolve the remote bgId locally against our current theme, ignoring the remote bgColor literal
        const effectiveTheme = resolveTheme(document.documentElement.getAttribute('data-theme') || 'light')
        const preset = BG_PRESETS.find(p => p.id === bgId) || BG_PRESETS[0]
        setCanvasBgColor(preset[effectiveTheme])
      } else if (bgColor) {
        setCanvasBgColor(bgColor)
      }
    }

    socket.on('canvas_bg_changed', handleBgChanged)
    return () => {
      socket.off('canvas_bg_changed', handleBgChanged)
    }
  }, [isConnected])

  // Track unread messages and display toast when chat is closed
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMsg = messages[messages.length - 1]
      // Only notify if chat is closed and it's not our own/system message
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

  const canvasRef = useRef(null)

  // Sync fabricCanvas after initial render when canvas ref is available
  useEffect(() => {
    const timer = setTimeout(() => {
      const fc = canvasRef.current?.getFabricCanvas()
      if (fc && fc !== fabricCanvas) setFabricCanvas(fc)
    }, 100)
    return () => clearTimeout(timer)
  }, [fabricCanvas])

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
            // Use our local theme to resolve it
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
        onToggleScreenShare={isSharing ? stopSharing : startSharing}
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
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          username={username}
        />
      )}

      <button
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
