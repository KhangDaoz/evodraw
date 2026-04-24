import { useState, useEffect } from 'react'
import './BottomBar.css'

export default function BottomBar() {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const handleZoomUpdate = (e) => setZoom(e.detail)
    window.addEventListener('evodraw:zoom', handleZoomUpdate)
    return () => window.removeEventListener('evodraw:zoom', handleZoomUpdate)
  }, [])

  const handleZoomIn = () => window.dispatchEvent(new CustomEvent('evodraw:request_zoom', { detail: 'in' }))
  const handleZoomOut = () => window.dispatchEvent(new CustomEvent('evodraw:request_zoom', { detail: 'out' }))
  const handleZoomReset = () => window.dispatchEvent(new CustomEvent('evodraw:request_zoom', { detail: 'reset' }))

  return (
    <div className="bottom-bar">
      {/* Zoom controls */}
      <div className="zoom-controls">
        <button title="Zoom out" onClick={handleZoomOut}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        <span className="zoom-value" onClick={handleZoomReset} title="Reset Zoom" style={{ cursor: 'pointer' }}>
          {Math.round(zoom * 100)}%
        </span>

        <button title="Zoom in" onClick={handleZoomIn}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        <span className="separator" />
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
