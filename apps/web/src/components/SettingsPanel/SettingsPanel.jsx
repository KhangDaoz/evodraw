import { useState, useRef, useEffect } from 'react'
import './SettingsPanel.css'

const THEME_OPTIONS = [
  { id: 'light', icon: '☀️', label: 'Light' },
  { id: 'dark', icon: '🌙', label: 'Dark' },
  { id: 'system', icon: '🖥️', label: 'System' },
]

// Each swatch has a light and dark variant — like Excalidraw
export const BG_PRESETS = [
  { id: 'default', light: '#ffffff', dark: '#121212' },
  { id: 'warm', light: '#f5f0e8', dark: '#1a1714' },
  { id: 'blue', light: '#f0f4ff', dark: '#121620' },
  { id: 'sage', light: '#e8ede4', dark: '#141a12' },
  { id: 'rose', light: '#fce4ec', dark: '#1c1215' },
  { id: 'mint', light: '#e0f2f1', dark: '#0f1a19' },
]

export function resolveTheme(themeId) {
  if (themeId === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return themeId
}

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('evodraw_theme', themeId)
}

export default function SettingsPanel({ roomCode, passcode, onLeaveRoom, username, onUsernameChange, canvasBgId, onBgChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [localUsername, setLocalUsername] = useState(username || 'Username')
  const [theme, setTheme] = useState(() => localStorage.getItem('evodraw_theme') || 'light')
  const [showPin, setShowPin] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const panelRef = useRef(null)

  const effectiveTheme = resolveTheme(theme)
  const activeBgId = canvasBgId || 'default'

  // Apply theme on mount and when changed
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // When theme changes, push new bg color for the *same* swatch
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    if (onBgChange) {
      const resolved = resolveTheme(newTheme)
      const preset = BG_PRESETS.find(p => p.id === activeBgId) || BG_PRESETS[0]
      onBgChange(activeBgId, preset[resolved])
    }
  }

  // Listen for system theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (onBgChange) {
        const resolved = mq.matches ? 'dark' : 'light'
        const preset = BG_PRESETS.find(p => p.id === activeBgId) || BG_PRESETS[0]
        onBgChange(activeBgId, preset[resolved])
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme, activeBgId, onBgChange])

  // Persist username externally with debounce
  useEffect(() => {
    if (localUsername.trim() && localUsername !== username) {
      const timer = setTimeout(() => {
        if (onUsernameChange) onUsernameChange(localUsername.trim())
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [localUsername, username, onUsernameChange])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleBgSelect = (preset) => {
    if (onBgChange) {
      onBgChange(preset.id, preset[effectiveTheme])
    }
  }

  const handleShareLink = () => {
    if (!roomCode || !passcode) return
    const encoded = btoa(`${roomCode}:${passcode}`)
    const inviteLink = `${window.location.origin}/join/${encoded}`
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }).catch(err => console.error('Failed to copy', err))
  }

  return (
    <div className="settings-wrapper" ref={panelRef}>
      {/* Hamburger button */}
      <button
        className="menu-btn"
        title="Menu"
        onClick={() => setIsOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="settings-panel">
          {/* Display Name */}
          <div className="settings-section">
            <label className="settings-label">Display Name</label>
            <input
              className="settings-input"
              type="text"
              value={localUsername}
              onChange={(e) => setLocalUsername(e.target.value)}
              placeholder="Username"
              maxLength={24}
            />
          </div>

          {/* Theme */}
          <div className="settings-section">
            <div className="theme-row">
              <label className="settings-label">Theme</label>
              <div className="theme-toggle">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className={`theme-btn ${theme === opt.id ? 'active' : ''}`}
                    onClick={() => handleThemeChange(opt.id)}
                    title={opt.label}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <select className="settings-select" defaultValue="en">
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>

          {/* Canvas Background — swatches adapt to current theme */}
          <div className="settings-section">
            <label className="settings-label">Canvas Background</label>
            <div className="bg-swatches">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`bg-swatch ${activeBgId === preset.id ? 'active' : ''}`}
                  style={{ background: preset[effectiveTheme] }}
                  onClick={() => handleBgSelect(preset)}
                  title={preset.id}
                />
              ))}
            </div>
          </div>

          {/* Room ID */}
          {roomCode && (
            <>
              <div className="settings-section">
                <div className="room-info-row">
                  <label className="settings-label">Room ID</label>
                  <span className="room-code-display">{roomCode}</span>
                </div>
              </div>

              {/* PIN */}
              <div className="settings-section">
                <div className="room-info-row">
                  <label className="settings-label">PIN</label>
                  <div className="pin-field">
                    <span className="pin-value">{showPin ? passcode : '••••'}</span>
                    <button
                      className="pin-toggle"
                      onClick={() => setShowPin((v) => !v)}
                      title={showPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {showPin ? (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        ) : (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Share Invite */}
              <div className="settings-section">
                <button className={`share-btn ${copiedLink ? 'copied' : ''}`} onClick={handleShareLink}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                  </svg>
                  <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Invite Link'}</span>
                </button>
              </div>

              {/* Leave Room */}
              <div className="settings-section settings-footer">
                 <button className="leave-btn" onClick={onLeaveRoom}>
                  Leave
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
