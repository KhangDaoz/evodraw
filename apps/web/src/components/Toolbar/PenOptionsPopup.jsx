import { PRESET_COLORS, PRESET_STROKES } from './toolDefinitions'

/**
 * Popup for pen color, stroke size, opacity, and stroke style options.
 * Shown when the user clicks the active pen tool button.
 */
export default function PenOptionsPopup({
  strokeColor,
  onColorChange,
  strokeWidth,
  onWidthChange,
  strokeOpacity,
  onOpacityChange,
  strokeStyle,
  onStyleChange,
  activeTool,
  onToolSelect
}) {
  const switchToPenIfNeeded = () => {
    if (['select', 'eraser'].includes(activeTool)) onToolSelect('pen')
  }

  return (
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
                switchToPenIfNeeded()
              }}
              title={c}
            />
          ))}
          {/* Custom color picker */}
          <label className="color-custom-btn" title="Custom color">
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => {
                onColorChange(e.target.value)
                switchToPenIfNeeded()
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
        <label>Stroke Size</label>
        <div className="stroke-presets">
          {PRESET_STROKES.map(({ label, value }) => (
            <button
              key={value}
              className={`stroke-preset-btn ${strokeWidth === value ? 'active' : ''}`}
              onClick={() => {
                onWidthChange(value)
                switchToPenIfNeeded()
              }}
              title={`${value}px`}
            >
              <span className="stroke-dot" style={{ width: Math.min(value, 20), height: Math.min(value, 20) }} />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity slider */}
      {onOpacityChange && (
        <div className="option-group">
          <label>Opacity: {Math.round(strokeOpacity * 100)}%</label>
          <div className="opacity-slider-container">
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.1" 
              value={strokeOpacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Stroke style (solid, dashed, dotted) */}
      {onStyleChange && (
        <div className="option-group">
          <label>Stroke Style</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              className={`stroke-style-btn ${strokeStyle === 'solid' ? 'active' : ''}`}
              onClick={() => onStyleChange('solid')}
            >Solid</button>
            <button 
              className={`stroke-style-btn ${strokeStyle === 'dashed' ? 'active' : ''}`}
              onClick={() => onStyleChange('dashed')}
            >Dashed</button>
            <button 
              className={`stroke-style-btn ${strokeStyle === 'dotted' ? 'active' : ''}`}
              onClick={() => onStyleChange('dotted')}
            >Dotted</button>
          </div>
        </div>
      )}
    </div>
  )
}
