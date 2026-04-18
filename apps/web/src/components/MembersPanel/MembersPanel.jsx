import { useState, useRef, useEffect } from 'react'
import './MembersPanel.css'

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

function getColor(name) {
  let hash = 0
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function Avatar({ name, size = 28 }) {
  const initials = name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div
      className="member-avatar"
      style={{ width: size, height: size, background: getColor(name), fontSize: size * 0.38 }}
      title={name}
    >
      {initials}
    </div>
  )
}

export default function MembersPanel({ currentUser, connectedUsers, isConnected }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Total count includes self
  const allUsers = currentUser
    ? [currentUser, ...connectedUsers.filter((u) => u !== currentUser)]
    : connectedUsers
  const count = allUsers.length

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div className="members-panel" ref={ref}>
      {/* Trigger button */}
      <button
        className="members-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Online members"
        aria-expanded={open}
      >
        {/* Stack up to 3 avatars */}
        <div className="avatar-stack">
          {allUsers.slice(0, 3).map((u) => (
            <Avatar key={u} name={u} size={24} />
          ))}
        </div>

        <span className="members-count">{count}</span>

        <span className={`presence-dot ${isConnected ? 'online' : 'offline'}`} />
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="members-dropdown" role="listbox" aria-label="Online members">
          <div className="members-dropdown-header">
            <span>Online</span>
            <span className="members-dropdown-count">{count}</span>
          </div>

          <ul className="members-list">
            {allUsers.map((u) => (
              <li key={u} className="member-row">
                <Avatar name={u} size={32} />
                <span className="member-name">
                  {u}
                  {u === currentUser && <span className="you-badge">you</span>}
                </span>
                <span className="member-online-dot" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
