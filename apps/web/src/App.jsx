import { useState } from 'react'
import Toolbar from './components/Toolbar/Toolbar'
import WelcomeOverlay from './components/WelcomeOverlay/WelcomeOverlay'
import BottomBar from './components/BottomBar/BottomBar'
import './App.css'

function App() {
  const [activeTool, setActiveTool] = useState(null)
  const [showOverlay, setShowOverlay] = useState(true)

  const handleToolSelect = (toolId) => {
    setActiveTool(toolId)
    if (showOverlay) setShowOverlay(false)
  }

  const handleJoinRoom = (roomCode) => {
    // TODO: Wire up to POST /api/rooms/join
    console.log('Joining room:', roomCode)
  }

  return (
    <div className="canvas">
      <div className="canvas-grid" />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        showHint={showOverlay}
      />

      {showOverlay && (
        <>
          <WelcomeOverlay onJoinRoom={handleJoinRoom} />

          <div className="settings-hint">
            <span>Preferences, languages, ...</span>
            <svg className="hint-cursor" width="28" height="36" viewBox="0 0 28 36" fill="none">
              <path d="M7 3L7 25L12 19L17 29L20.5 27.5L15.5 18L23 18L7 3Z"
                fill="#c0c0c0" stroke="#999" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </div>

          <button className="menu-btn" title="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          </button>
        </>
      )}

      <BottomBar />
    </div>
  )
}

export default App
