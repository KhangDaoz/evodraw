import { useState, useEffect } from 'react'
import {
  mainTools, shapeTools,
  undoIcon, redoIcon,
  micOnIcon, micOffIcon,
  screenShareOnIcon, screenShareOffIcon,
} from './toolDefinitions'
import PenOptionsPopup from './PenOptionsPopup'
import ScreenShareOptions from './ScreenShareOptions'
import './Toolbar.css'

export default function Toolbar({
  activeTool,
  onToolSelect,
  strokeColor,
  onColorChange,
  strokeWidth,
  onWidthChange,
  strokeOpacity = 1,
  onOpacityChange,
  strokeStyle = 'solid',
  onStyleChange,
  onUndo,
  onRedo,
  showHint,
  isVoiceActive,
  onToggleVoice,
  isScreenSharing,
  activeShareCount = 0,
  onToggleScreenShare,
  screenResolution = '1080p',
  onChangeResolution,
  screenAudio = false,
  onToggleScreenAudio,
  screenFps = 30,
  onChangeFps
}) {
  const [showOptions, setShowOptions] = useState(false)
  const [showShapeOptions, setShowShapeOptions] = useState(false)
  const [showScreenOptions, setShowScreenOptions] = useState(false)
  const [lastUsedShape, setLastUsedShape] = useState('rectangle')

  const isShapeActive = shapeTools.some(t => t.id === activeTool)
  const currentShapeId = isShapeActive ? activeTool : lastUsedShape
  const currentShapeTool = shapeTools.find(t => t.id === currentShapeId)

  useEffect(() => {
    if (isShapeActive && activeTool !== lastUsedShape) {
      setLastUsedShape(activeTool)
    }
  }, [activeTool, isShapeActive, lastUsedShape])

  // Close all popups helper
  const closeAllPopups = () => {
    setShowOptions(false)
    setShowShapeOptions(false)
    setShowScreenOptions(false)
  }

  return (
    <div className="toolbar-area">
      <nav className="toolbar" style={{ position: 'relative' }}>

        {/* Select Tool */}
        <button
          className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToolSelect('select'); closeAllPopups() }}
          title="Select"
        >
          {mainTools.find(t => t.id === 'select').icon}
        </button>

        {/* Pen Tool + Options Popup */}
        <div style={{ position: 'relative' }}>
          <button
            className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (activeTool !== 'pen') {
                onToolSelect('pen')
                setShowShapeOptions(false)
                setShowScreenOptions(false)
              } else {
                setShowOptions(!showOptions)
                if (!showOptions) setShowScreenOptions(false)
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setShowOptions(!showOptions)
              if (!showOptions) setShowScreenOptions(false)
            }}
            title="Pen (Click again for options)"
          >
            {mainTools.find(t => t.id === 'pen').icon}
            <span style={{ 
              position: 'absolute', bottom: 4, right: 4, 
              width: 8, height: 8, borderRadius: '50%', 
              backgroundColor: strokeColor || '#000000',
              border: '1px solid rgba(0,0,0,0.1)' 
            }}></span>
          </button>

          {showOptions && (
            <PenOptionsPopup
              strokeColor={strokeColor}
              onColorChange={onColorChange}
              strokeWidth={strokeWidth}
              onWidthChange={onWidthChange}
              strokeOpacity={strokeOpacity}
              onOpacityChange={onOpacityChange}
              strokeStyle={strokeStyle}
              onStyleChange={onStyleChange}
              activeTool={activeTool}
              onToolSelect={onToolSelect}
            />
          )}
        </div>

        {/* Eraser Tool */}
        <button
          className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToolSelect('eraser'); closeAllPopups() }}
          title="Eraser"
        >
          {mainTools.find(t => t.id === 'eraser').icon}
        </button>

        {/* Text Tool */}
        <button
          className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToolSelect('text'); closeAllPopups() }}
          title="Text"
        >
          {mainTools.find(t => t.id === 'text').icon}
        </button>

        {/* Shape Menu */}
        <div style={{ position: 'relative' }}>
          <button
            className={`tool-btn ${isShapeActive ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (!isShapeActive) onToolSelect(currentShapeId)
              setShowShapeOptions(!showShapeOptions)
              setShowOptions(false)
              setShowScreenOptions(false)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setShowShapeOptions(!showShapeOptions)
              if (!showShapeOptions) setShowScreenOptions(false)
            }}
            title="Shapes"
          >
            {currentShapeTool.icon}
            <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: '0.6em', opacity: 0.7 }}>▾</span>
          </button>

          {showShapeOptions && (
            <div className="toolbar animate-fade-in" style={{
              position: 'absolute', left: '100%', top: 0,
              marginLeft: '8px', flexDirection: 'row', padding: '4px'
            }}>
              {shapeTools.map((tool) => (
                <button
                  key={tool.id}
                  className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToolSelect(tool.id)
                    setShowShapeOptions(false)
                  }}
                  title={tool.label}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '20px', height: '1px', backgroundColor: '#e0e0e0', margin: '4px 0' }} />

        {/* Undo / Redo */}
        {onUndo && (
          <button className="tool-btn" onClick={(e) => { e.stopPropagation(); onUndo() }} title="Undo (Ctrl+Z)">
            {undoIcon}
          </button>
        )}
        {onRedo && (
          <button className="tool-btn" onClick={(e) => { e.stopPropagation(); onRedo() }} title="Redo (Ctrl+Y)">
            {redoIcon}
          </button>
        )}

        {/* Divider */}
        <div style={{ width: '20px', height: '1px', backgroundColor: '#e0e0e0', margin: '4px 0' }} />

        {/* Voice Toggle */}
        {onToggleVoice && (
          <button
            className={`tool-btn ${isVoiceActive ? 'active voice-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleVoice() }}
            title={isVoiceActive ? "Mute Microphone" : "Unmute Microphone"}
          >
            {isVoiceActive ? micOnIcon : micOffIcon}
          </button>
        )}

        {/* Screen Share Toggle + Options */}
        {onToggleScreenShare && (
          <div style={{ position: 'relative' }}>
            <button
              className={`tool-btn ${isScreenSharing ? 'active screen-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleScreenShare()
                closeAllPopups()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowScreenOptions(!showScreenOptions)
                setShowOptions(false)
                setShowShapeOptions(false)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setShowScreenOptions(!showScreenOptions)
                setShowOptions(false)
                setShowShapeOptions(false)
              }}
              title={isScreenSharing ? "Stop Screen Share (Right-click for options)" : "Share Screen (Right-click for options)"}
              style={{ position: 'relative' }}
            >
              {isScreenSharing ? screenShareOnIcon : screenShareOffIcon}
              {activeShareCount > 0 && !isScreenSharing && (
                <span className="screen-share-badge">{activeShareCount}</span>
              )}
            </button>

            {showScreenOptions && (
              <ScreenShareOptions
                screenResolution={screenResolution}
                onChangeResolution={onChangeResolution}
                screenFps={screenFps}
                onChangeFps={onChangeFps}
                screenAudio={screenAudio}
                onToggleScreenAudio={onToggleScreenAudio}
              />
            )}
          </div>
        )}
      </nav>

      {/* Onboarding hint */}
      {showHint && (
        <div className="toolbar-hint">
          <svg width="30" height="38" viewBox="0 0 30 38" fill="none">
            <path d="M8 3L8 26L13 20L18 30L21.5 28.5L16.5 19L24 19L8 3Z"
              fill="#c4c4c4" stroke="#aaa" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <p>Pick a tool &amp;<br />Start drawing!</p>
        </div>
      )}
    </div>
  )
}
