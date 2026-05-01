import { useRef, useState } from 'react'
import { PRESET_COLORS } from './toolDefinitions'

const MIN_STROKE = 1
const MAX_STROKE = 40

/**
 * Popup for pen color, stroke size (presets + slider + live preview), and
 * opacity. Shown when the user clicks the active pen tool button.
 *
 * Custom colors picked by the user are saved into the main color palette
 * (managed by the parent Toolbar) similar to Miro / Microsoft Paint.
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
  onToolSelect,
  customColors = [],
  onAddCustomColor,
  onRemoveCustomColor,
}) {
  const switchToPenIfNeeded = () => {
    if (['select', 'eraser'].includes(activeTool)) onToolSelect('pen')
  }

  // Colorpicker is hidden; we track whether the user is actively dragging it
  // so we only add a color to the palette on "close" (commit), not on every
  // intermediate value. Mirrors how Paint / Miro treat custom colors.
  const colorInputRef = useRef(null)
  const [pickerDraft, setPickerDraft] = useState(null)

  const commitPickerDraft = () => {
    const nextColor = pickerDraft?.toLowerCase()
    const exists = customColors.some((color) => color.toLowerCase() === nextColor)
    if (nextColor && onAddCustomColor && !exists) onAddCustomColor(pickerDraft)
    setPickerDraft(null)
  }

  const resolvedStrokeWidth = Math.min(Math.max(strokeWidth || 1, MIN_STROKE), MAX_STROKE)
  const previewRadius = Math.max(1.5, Math.min(resolvedStrokeWidth / 2, 18))

  return (
    <div className="tool-options animate-fade-in" style={{
      position: 'absolute',
      left: '100%',
      top: 0,
      marginLeft: '8px',
      transform: 'none'
    }}>
      {/* Color presets — preset + custom colors share the same grid so
          user-added colors feel like a natural extension of the palette. */}
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
          {customColors.map((c) => (
            <button
              key={c}
              className={`color-swatch-btn custom-swatch ${strokeColor?.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
              style={{ '--swatch': c }}
              onClick={() => {
                onColorChange(c)
                switchToPenIfNeeded()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (onRemoveCustomColor) onRemoveCustomColor(c)
              }}
              title={`${c} — right-click to remove`}
            >
              <span
                className="custom-swatch-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onRemoveCustomColor) onRemoveCustomColor(c)
                }}
                title="Remove"
              >×</span>
            </button>
          ))}
          {/* Custom color picker (+) — opens the native picker. The chosen
              color is previewed live and added once when the picker closes. */}
          <label className="color-custom-btn" title="Add custom color">
            <input
              ref={colorInputRef}
              type="color"
              value={pickerDraft || strokeColor}
              onInput={(e) => {
                const val = e.target.value
                setPickerDraft(val)
                onColorChange(val)
                switchToPenIfNeeded()
              }}
              onChange={(e) => {
                // Keep the final color selected; actual save is handled in onBlur
                // so dragging inside the picker won't spam many saved swatches.
                const val = e.target.value
                onColorChange(val)
                setPickerDraft(val)
                switchToPenIfNeeded()
              }}
              onBlur={commitPickerDraft}
              style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
            />
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v12M2 8h12" strokeLinecap="round" />
            </svg>
          </label>
        </div>
      </div>

      {/* Stroke size */}
      <div className="option-group">
        <label>Stroke Size</label>

        {/* Fine-grained thickness slider + square live preview */}
        <div className="stroke-slider-container">
          <input
            type="range"
            min={MIN_STROKE}
            max={MAX_STROKE}
            step="1"
            value={resolvedStrokeWidth}
            onChange={(e) => {
              onWidthChange(parseInt(e.target.value, 10))
              switchToPenIfNeeded()
            }}
          />
          <div className="stroke-preview-square" title={`${strokeWidth || 1}px preview`}>
            <svg
              className="stroke-preview-square-svg"
              viewBox="0 0 48 48"
              preserveAspectRatio="none"
            >
              <circle
                cx="24"
                cy="24"
                r={previewRadius}
                fill={strokeColor || '#000000'}
                fillOpacity={strokeOpacity ?? 1}
              />
            </svg>
          </div>
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
          <div className="stroke-style-row">
            <button
              className={`stroke-style-btn ${strokeStyle === 'solid' ? 'active' : ''}`}
              onClick={() => {
                onStyleChange('solid')
                switchToPenIfNeeded()
              }}
              title="Solid"
              aria-label="Solid stroke"
            >
              <span className="stroke-style-sample solid" />
            </button>
            <button
              className={`stroke-style-btn ${strokeStyle === 'dashed' ? 'active' : ''}`}
              onClick={() => {
                onStyleChange('dashed')
                switchToPenIfNeeded()
              }}
              title="Dashed"
              aria-label="Dashed stroke"
            >
              <span className="stroke-style-sample dashed" />
            </button>
            <button
              className={`stroke-style-btn ${strokeStyle === 'dotted' ? 'active' : ''}`}
              onClick={() => {
                onStyleChange('dotted')
                switchToPenIfNeeded()
              }}
              title="Dotted"
              aria-label="Dotted stroke"
            >
              <span className="stroke-style-sample dotted" />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
