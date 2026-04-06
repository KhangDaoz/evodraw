import { useState } from 'react'
import { useEffect } from 'react'
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom'
import useRoom from '../../hooks/useRoom'
import Toolbar from '../../components/Toolbar/Toolbar'
import BottomBar from '../../components/BottomBar/BottomBar'
import Canvas from '../../components/Canvas/Canvas'
import SettingsPanel from '../../components/SettingsPanel/SettingsPanel'
import MembersPanel from '../../components/MembersPanel/MembersPanel'
import { generateAnonymousName } from '../../utils/nameGenerator'
import './RoomPage.css'

export default function RoomPage() {
  const { roomCode } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const username = location.state?.username || localStorage.getItem('evodraw_username') || generateAnonymousName()
  const [passcode] = useState(location.state?.passcode || '')
  const [activeTool, setActiveTool] = useState('pen')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(5)

  // Clear passcode from history securely, bypassing StrictMode double-mount issues
  useEffect(() => {
    if (location.state?.passcode) {
      const timer = setTimeout(() => {
        navigate('.', { replace: true, state: { ...location.state, passcode: '' } })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [navigate, location.state])

  const { isConnected, connectedUsers, error } = useRoom(roomCode, username, passcode)

  if (!passcode) {
    return <Navigate to="/" state={{ roomCode, error: 'Please enter the room passcode' }} replace />
  }

  // If server rejected the passcode, kick them out
  if (error && error.includes('Access Denied')) {
    return <Navigate to="/" state={{ roomCode, error }} replace />
  }

  if (!username) {
    return <Navigate to="/" replace />
  }

  const handleLeaveRoom = () => {
    navigate('/', { replace: true })
  }

  return (
    <div className="room-page">
      <Canvas
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        roomId={roomCode}
      />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        onColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onWidthChange={setStrokeWidth}
        showHint={false}
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

      <BottomBar />
    </div>
  )
}

