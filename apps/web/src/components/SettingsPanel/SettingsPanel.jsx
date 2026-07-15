import { useState, useRef, useEffect } from 'react'
import { createInvite } from '../../services/api'
import { BG_PRESETS, getBgPreset, getStoredTheme, resolveTheme, applyTheme, getCanvasStyle, applyCanvasStyle } from '../../utils/theme'
import './SettingsPanel.css'

const THEME_OPTIONS = [
  {
    id: 'light',
    label: 'Light',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: 'system',
    label: 'System',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
]

const CANVAS_STYLE_OPTIONS = [
  {
    id: 'dots',
    label: 'Dots',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="5" cy="5" r="1.6" />
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="19" cy="5" r="1.6" />
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
        <circle cx="5" cy="19" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
        <circle cx="19" cy="19" r="1.6" />
      </svg>
    ),
  },
  {
    id: 'grid',
    label: 'Grid',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
      </svg>
    ),
  },
  {
    id: 'none',
    label: 'None',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
      </svg>
    ),
  },
]

export default function SettingsPanel({ roomCode, passcode, onLeaveRoom, username, onUsernameChange, canvasBgId, onBgChange, onExport, onImport }) {
  const [isOpen, setIsOpen] = useState(false)
  const [localUsername, setLocalUsername] = useState(username || 'Username')
  const [theme, setTheme] = useState(getStoredTheme)
  const [canvasStyle, setCanvasStyle] = useState(getCanvasStyle)
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
      onBgChange(activeBgId, getBgPreset(activeBgId)[resolved])
    }
  }

  // Listen for system theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (onBgChange) {
        const resolved = mq.matches ? 'dark' : 'light'
        onBgChange(activeBgId, getBgPreset(activeBgId)[resolved])
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

  const handleShareLink = async () => {
    if (!roomCode) return
    try {
      // Server-signed invite token — the passcode is no longer embedded in the URL.
      const { data } = await createInvite()
      const inviteLink = `${window.location.origin}/join/${data.invite}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch (err) {
      console.error('Failed to create invite link', err)
    }
  }

  return (
    // stopPropagation: on the landing page the surrounding canvas click handler
    // creates a room, which the panel's clicks must never trigger.
    <div className="settings-wrapper" ref={panelRef} onClick={(e) => e.stopPropagation()}>
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
          {roomCode && (
            <>
              {/* Actions */}
              <button className="menu-item" onClick={onExport} title="Export board as JSON">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export board...</span>
              </button>
              <label className="menu-item" title="Import board from JSON" tabIndex={0}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Import board...</span>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files[0] && onImport) {
                      onImport(e.target.files[0])
                      e.target.value = ''
                    }
                  }}
                />
              </label>
              <button className={`menu-item ${copiedLink ? 'success' : ''}`} onClick={handleShareLink}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>{copiedLink ? 'Copied to clipboard!' : 'Copy invite link'}</span>
              </button>
              <button className="menu-item danger" onClick={onLeaveRoom}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Leave room</span>
              </button>

              <div className="menu-divider" />

              {/* Room info */}
              <div className="menu-row">
                <span className="menu-row-label">Room ID</span>
                <span className="room-code-display">{roomCode}</span>
              </div>
              {/* PIN — hidden for invite-joined users, who never receive the passcode */}
              {passcode && (
                <div className="menu-row">
                  <span className="menu-row-label">PIN</span>
                  <div className="pin-field">
                    <span className="pin-value">{showPin ? passcode : '•'.repeat(passcode.length)}</span>
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
              )}

              <div className="menu-divider" />
            </>
          )}

          {/* Preferences */}
          <div className="prefs-block">
            <label className="prefs-label">Display name</label>
            <input
              className="settings-input"
              type="text"
              value={onUsernameChange ? localUsername : (username || '')}
              onChange={onUsernameChange ? (e) => setLocalUsername(e.target.value) : undefined}
              readOnly={!onUsernameChange}
              placeholder="Username"
              maxLength={24}
              title={onUsernameChange ? undefined : 'Display name is set at join time'}
            />
          </div>

          <div className="menu-row">
            <span className="menu-row-label">Theme</span>
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

          {/* Canvas style — device-local preference, available everywhere */}
          <div className="menu-row">
            <span className="menu-row-label">Canvas style</span>
            <div className="theme-toggle">
              {CANVAS_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`theme-btn ${canvasStyle === opt.id ? 'active' : ''}`}
                  onClick={() => {
                    setCanvasStyle(opt.id)
                    applyCanvasStyle(opt.id)
                  }}
                  title={opt.label}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas background — swatches adapt to current theme.
              Only shown where a canvas actually consumes it. */}
          {onBgChange && (
            <div className="prefs-block">
              <label className="prefs-label">Canvas background</label>
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
          )}
        </div>
      )}
    </div>
  )
}
