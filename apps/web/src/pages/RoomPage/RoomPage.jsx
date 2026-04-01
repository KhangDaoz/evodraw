import { useState } from 'react'
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom'
import useRoom from '../../hooks/useRoom'
import Toolbar from '../../components/Toolbar/Toolbar'
import BottomBar from '../../components/BottomBar/BottomBar'
import Canvas from '../../components/Canvas/Canvas'
import SettingsPanel from '../../components/SettingsPanel/SettingsPanel'
import './RoomPage.css'

export default function RoomPage() {
  const { roomCode } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const username = location.state?.username || localStorage.getItem('evodraw_username') || ''
  const passcode = location.state?.passcode || ''
  const [activeTool, setActiveTool] = useState('pen')

  const { isConnected, connectedUsers, error } = useRoom(roomCode, username)

  if (!username) {
    return <Navigate to="/" replace />
  }

  const handleLeaveRoom = () => {
    navigate('/', { replace: true })
  }

  return (
    <div className="room-page">
      <Canvas />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        showHint={false}
      />

      {/* Connection status + user count (compact) */}
      <div className="room-status-bar">
        <div className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <div className="users-indicator" title={connectedUsers.join(', ') || 'Only you'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{connectedUsers.length + 1}</span>
        </div>
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
