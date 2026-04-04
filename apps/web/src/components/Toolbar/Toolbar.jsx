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
  showHint
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
        {mainTools.map((tool) => (
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
        {/* Options Toggle currently showing the active stroke color */}
        <button
          className={`tool-btn ${showOptions ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setShowOptions(!showOptions)
          }}
          title="Color & Thickness"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="6" fill={strokeColor || '#000000'} />
          </svg>
        </button>
      </nav>

      {/* Tool Options Menu */}
      {showOptions && (
        <div className="tool-options animate-fade-in">
          {/* Color presets */}
          <div className="option-group">
            <label>Color</label>
            <div className="color-swatches">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch-btn ${strokeColor === c ? 'active' : ''}`}
                  style={{ '--swatch': c }}
                  onClick={() => onColorChange(c)}
                  title={c}
                />
              ))}
              {/* Custom color picker as last swatch */}
              <label className="color-custom-btn" title="Custom color">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => onColorChange(e.target.value)}
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
                  onClick={() => onWidthChange(value)}
                  title={`${value}px`}
                >
                  <span className="stroke-dot" style={{ width: Math.min(value, 20), height: Math.min(value, 20) }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
