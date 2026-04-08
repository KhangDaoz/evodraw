import './Toolbar.css'

/* Tool definitions with SVG icons */
const mainTools = [
  {
    id: 'select',
    label: 'Select',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    ),
  },
  {
    id: 'pen',
    label: 'Pen',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: 'Eraser',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16a1.4 1.4 0 0 1 0-2L13 4a1.4 1.4 0 0 1 2 0L20 9a1.4 1.4 0 0 1 0 2L11 20" />
        <path d="M10 11l4 4" />
      </svg>
    ),
  },
  {
    id: 'text',
    label: 'Text',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9.5" y1="20" x2="14.5" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  }
]

const shapeTools = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    id: 'circle',
    label: 'Circle',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    id: 'line',
    label: 'Line',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    ),
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="19" x2="19" y2="5" />
        <polyline points="10 5 19 5 19 14" />
      </svg>
    ),
  }
]

import { useState, useEffect } from 'react'

const PRESET_COLORS = [
  '#1a1a1a', // Near black
  '#e03131', // Red
  '#f76707', // Orange
  '#f59f00', // Yellow
  '#2f9e44', // Green
  '#1971c2', // Blue
  '#7048e8', // Violet
  '#c2255c', // Pink
]

const PRESET_STROKES = [
  { label: 'XS', value: 2 },
  { label: 'S', value: 5 },
  { label: 'M', value: 10 },
  { label: 'L', value: 20 },
]

export default function Toolbar({
  activeTool,
  onToolSelect,
  strokeColor,
  onColorChange,
  strokeWidth,
  onWidthChange,
  showHint,
  isVoiceActive,
  onToggleVoice
}) {
  const [showOptions, setShowOptions] = useState(false)
  const [showShapeOptions, setShowShapeOptions] = useState(false)
  const [lastUsedShape, setLastUsedShape] = useState('rectangle')

  const isShapeActive = shapeTools.some(t => t.id === activeTool)
  const currentShapeId = isShapeActive ? activeTool : lastUsedShape
  const currentShapeTool = shapeTools.find(t => t.id === currentShapeId)

  useEffect(() => {
    if (isShapeActive && activeTool !== lastUsedShape) {
      setLastUsedShape(activeTool)
    }
  }, [activeTool, isShapeActive, lastUsedShape])

  return (
    <div className="toolbar-area">
      {/* Tool buttons */}
      <nav className="toolbar" style={{ position: 'relative' }}>
        {/* Select Tool */}
        <button
          className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToolSelect('select')
            setShowShapeOptions(false)
            setShowOptions(false)
          }}
          title="Select"
        >
          {mainTools.find(t => t.id === 'select').icon}
        </button>

        {/* Pen Tool with popup */}
        <div style={{ position: 'relative' }}>
          <button
            className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (activeTool !== 'pen') {
                onToolSelect('pen')
                setShowShapeOptions(false)
              } else {
                setShowOptions(!showOptions)
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setShowOptions(!showOptions)
            }}
            title="Pen (Click again for options)"
          >
            {mainTools.find(t => t.id === 'pen').icon}
            {/* Tiny color indicator */}
            <span style={{ 
              position: 'absolute', 
              bottom: 4, 
              right: 4, 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              backgroundColor: strokeColor || '#000000',
              border: '1px solid rgba(0,0,0,0.1)' 
            }}></span>
          </button>

          {/* Color & Stroke Options Popup tied to Pen */}
          {showOptions && (
            <div className="tool-options animate-fade-in" style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              marginLeft: '8px',
              transform: 'none'
            }}>
              {/* Color presets */}
              <div className="option-group">
                <label>Color</label>
                <div className="color-swatches">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch-btn ${strokeColor === c ? 'active' : ''}`}
                      style={{ '--swatch': c }}
                      onClick={() => {
                        onColorChange(c)
                        if (['select', 'eraser'].includes(activeTool)) onToolSelect('pen')
                      }}
                      title={c}
                    />
                  ))}
                  {/* Custom color picker as last swatch */}
                  <label className="color-custom-btn" title="Custom color">
                    <input
                      type="color"
                      value={strokeColor}
                      onChange={(e) => {
                        onColorChange(e.target.value)
                        if (['select', 'eraser'].includes(activeTool)) onToolSelect('pen')
                      }}
                      style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
                    />
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 2v12M2 8h12" strokeLinecap="round" />
                    </svg>
                  </label>
                </div>
              </div>

              {/* Stroke size presets */}
              <div className="option-group">
                <label>Stroke</label>
                <div className="stroke-presets">
                  {PRESET_STROKES.map(({ label, value }) => (
                    <button
                      key={value}
                      className={`stroke-preset-btn ${strokeWidth === value ? 'active' : ''}`}
                      onClick={() => {
                        onWidthChange(value)
                        if (['select', 'eraser'].includes(activeTool)) onToolSelect('pen')
                      }}
                      title={`${value}px`}
                    >
                      <span className="stroke-dot" style={{ width: Math.min(value, 20), height: Math.min(value, 20) }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Eraser Tool */}
        <button
          className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToolSelect('eraser')
            setShowShapeOptions(false)
            setShowOptions(false)
          }}
          title="Eraser"
        >
          {mainTools.find(t => t.id === 'eraser').icon}
        </button>

        {/* Text Tool */}
        <button
          className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToolSelect('text')
            setShowShapeOptions(false)
            setShowOptions(false)
          }}
          title="Text"
        >
          {mainTools.find(t => t.id === 'text').icon}
        </button>

        {/* Shape Menu Toggle */}
        <div style={{ position: 'relative' }}>
          <button
            className={`tool-btn ${isShapeActive ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (!isShapeActive) {
                onToolSelect(currentShapeId)
              }
              setShowShapeOptions(!showShapeOptions)
              setShowOptions(false)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setShowShapeOptions(!showShapeOptions)
            }}
            title="Shapes"
          >
            {currentShapeTool.icon}
            <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: '0.6em', opacity: 0.7 }}>▾</span>
          </button>

          {/* Submenu for shapes */}
          {showShapeOptions && (
            <div className="toolbar animate-fade-in" style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              marginLeft: '8px',
              flexDirection: 'row',
              padding: '4px'
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

        {/* Voice Toggle */}
        {onToggleVoice && (
          <button
            className={`tool-btn ${isVoiceActive ? 'active voice-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleVoice()
            }}
            title={isVoiceActive ? "Mute Microphone" : "Unmute Microphone"}
          >
            {isVoiceActive ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </button>
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
