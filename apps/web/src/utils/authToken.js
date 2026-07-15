// Client-side helpers for the room JWT stored in localStorage under `token`.
//
// These decode the token WITHOUT verifying its signature — they exist only to
// drive UX decisions (e.g. whether to render the room after a page refresh).
// The authoritative check is always server-side: the socket handshake verifies
// the signature (see server sockets/index.js), so a forged localStorage token
// cannot actually join a room.

const TOKEN_KEY = 'token'

/**
 * Decode a JWT payload (the middle segment) without signature verification.
 * @returns {object|null} the decoded claims, or null if missing/malformed.
 */
function decodeToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    // JWT uses base64url; convert to base64 and pad before atob.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/**
 * True when localStorage holds an unexpired token scoped to `roomCode`.
 * Used as a durable admit signal that survives page refresh (navigation state
 * does not). Case-insensitive on the room code.
 */
export function hasValidRoomToken(roomCode) {
  const decoded = decodeToken(localStorage.getItem(TOKEN_KEY))
  // Legacy wire key: tokens issued before the rename carry `roomId` (the server
  // middleware accepts both the same way).
  const claimedCode = decoded?.roomCode ?? decoded?.roomId
  if (!claimedCode) return false
  if (typeof decoded.exp === 'number' && decoded.exp * 1000 <= Date.now()) return false
  return String(claimedCode).toUpperCase() === String(roomCode || '').toUpperCase()
}
