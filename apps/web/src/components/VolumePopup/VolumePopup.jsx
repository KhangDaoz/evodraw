import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './VolumePopup.css'

function SpeakerIcon({ level }) {
  // level: 'muted' | 'low' | 'high'
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {level === 'muted' && <><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>}
      {level === 'low' && <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      {level === 'high' && <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
    </svg>
  )
}

/**
 * Small popup with a mute toggle + volume slider (0–100%).
 * Positioned by the parent at { x, y } (a right-click location); clamps to stay on-screen.
 * Closes on outside click or Escape.
 *
 * @param {string} label   - Title shown above the slider
 * @param {number} volume   - Current volume, 0..1
 * @param {(v:number)=>void} onChange - Called with new volume 0..1
 * @param {()=>void} onClose - Called to dismiss the popup
 * @param {{x:number,y:number}} position - Requested screen coordinates
 */
export default function VolumePopup({ label, volume, onChange, onClose, position }) {
  const ref = useRef(null)
  const lastNonZero = useRef(volume > 0 ? volume : 1)
  const [coords, setCoords] = useState(position)

  const vol = volume ?? 1
  const pct = Math.round(vol * 100)
  const level = vol === 0 ? 'muted' : vol < 0.5 ? 'low' : 'high'

  // Remember the last audible level so the mute toggle can restore it.
  useEffect(() => {
    if (vol > 0) lastNonZero.current = vol
  }, [vol])

  // Keep the popup fully within the viewport regardless of click location.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    const x = Math.min(position.x, window.innerWidth - width - margin)
    const y = Math.min(position.y, window.innerHeight - height - margin)
    setCoords({ x: Math.max(margin, x), y: Math.max(margin, y) })
  }, [position])

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const toggleMute = () => onChange(vol === 0 ? lastNonZero.current : 0)

  return (
    <div
      ref={ref}
      className="volume-popup"
      style={{ left: coords.x, top: coords.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="volume-popup-label">{label}</div>
      <div className="volume-popup-row">
        <button
          type="button"
          className="volume-popup-mute"
          onClick={toggleMute}
          title={vol === 0 ? 'Unmute' : 'Mute'}
          aria-label={vol === 0 ? 'Unmute' : 'Mute'}
        >
          <SpeakerIcon level={level} />
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          style={{ '--fill': `${pct}%` }}
          aria-label={`${label} volume`}
        />
        <span className="volume-popup-value">{pct}%</span>
      </div>
    </div>
  )
}
