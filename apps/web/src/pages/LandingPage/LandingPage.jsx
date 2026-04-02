import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { joinRoom, createRoom } from '../../services/api'
import Toolbar from '../../components/Toolbar/Toolbar'
import BottomBar from '../../components/BottomBar/BottomBar'
import Canvas from '../../components/Canvas/Canvas'
import SettingsPanel from '../../components/SettingsPanel/SettingsPanel'
import { generateAnonymousName } from '../../utils/nameGenerator'
import './LandingPage.css'

export default function LandingPage() {
  const navigate = useNavigate()
  const [activeTool, setActiveTool] = useState(null)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(5)
  const [showOverlay, setShowOverlay] = useState(true)
  const location = useLocation()
  const [roomCode, setRoomCode] = useState(location.state?.roomCode || '')
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(location.state?.error || '')

  const dismissOverlay = useCallback(() => {
    if (showOverlay) setShowOverlay(false)
  }, [showOverlay])

  const handleInteractionCreateRoom = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const res = await createRoom()
      const { code, passcode: newPasscode } = res.data // code and passcode from server
      const username = localStorage.getItem('evodraw_username') || generateAnonymousName()
      navigate(`/room/${code}`, {
        state: { passcode: newPasscode, username }
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleToolSelect = (toolId) => {
    setActiveTool(toolId)
    if (showOverlay) {
      handleInteractionCreateRoom()
    } else {
      dismissOverlay()
    }
  }

  const handleCanvasClick = (e) => {
    if (showOverlay) {
      handleInteractionCreateRoom()
    } else {
      dismissOverlay()
    }
  }

  const handleJoinRoom = async (e) => {
    e.preventDefault()

    if (!roomCode.trim() || !passcode.trim()) {
      setError('Room code and passcode are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await joinRoom(roomCode.trim(), passcode.trim())
      const username = localStorage.getItem('evodraw_username') || generateAnonymousName()
      navigate(`/room/${roomCode.trim().toUpperCase()}`, {
        state: { passcode: passcode.trim(), username }
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="room-page" onClick={handleCanvasClick}>
      <Canvas 
        activeTool={activeTool}
        strokeColor={strokeColor} 
        strokeWidth={strokeWidth} 
      />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        strokeColor={strokeColor}
        onColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onWidthChange={setStrokeWidth}
        showHint={showOverlay}
      />

      {showOverlay && (
        <>
          <div className="welcome" onClick={(e) => e.stopPropagation()}>
            <h1 className="welcome-title">EvoDraw</h1>
            <p className="welcome-desc">
              Your drawings are saved in your browser's storage.<br />
              Browser storage can be cleared unexpectedly.<br />
              Save your work to a file regularly to avoid losing it.
            </p>

            {error && <p className="welcome-error">{error}</p>}

            <form className="welcome-form" onSubmit={handleJoinRoom}>
              <input
                type="text"
                placeholder="Room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoComplete="off"
              />
              <input
                type="text"
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                maxLength={4}
                autoComplete="off"
                inputMode="numeric"
              />
              <button type="submit" disabled={loading}>
                {loading ? '...' : 'Join'}
              </button>
            </form>
          </div>

          <div className="settings-hint">
            <span>Preferences, languages, ...</span>
            <svg className="hint-cursor" width="28" height="36" viewBox="0 0 28 36" fill="none">
              <path d="M7 3L7 25L12 19L17 29L20.5 27.5L15.5 18L23 18L7 3Z"
                fill="#c0c0c0" stroke="#999" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      )}

      <SettingsPanel />
      <BottomBar />
    </div>
  )
}
