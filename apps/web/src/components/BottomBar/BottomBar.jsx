import './BottomBar.css'

export default function BottomBar() {
  return (
    <div className="bottom-bar">
      {/* Color swatch */}
      <div className="color-swatch" title="Current color">
        <div className="color-fill" />
      </div>

      {/* Zoom & undo/redo */}
      <div className="zoom-controls">
        <button title="Zoom out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        <span className="zoom-value">100%</span>

        <button title="Zoom in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        <span className="separator" />

        <button title="Undo">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 6 2 8 4 10" />
            <path d="M2 8h8a4 4 0 0 1 0 8H8" />
          </svg>
        </button>

        <button title="Redo">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 6 14 8 12 10" />
            <path d="M14 8H6a4 4 0 0 0 0 8h2" />
          </svg>
        </button>
      </div>

      {/* Help */}
      <button className="help-btn" title="Help">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6 6a2 2 0 1 1 2.5 1.94c-.35.18-.5.56-.5.94V10" />
          <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  )
}
