 const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export async function createRoom() {
  const res = await fetch(`${BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || 'Failed to create room')
  }

  const token = res.headers.get('Authorization')?.split(' ')[1]
  if(token) {
    localStorage.setItem('token', token)
  }

  return res.json()
}

export async function joinRoom(code, passcode) {
  const res = await fetch(`${BASE_URL}/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), passcode }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || 'Invalid room code or passcode')
  }

  const token = res.headers.get('Authorization')?.split(' ')[1]
  if(token) {
    localStorage.setItem('token', token)
  }

  return res.json()
}

/**
 * Mint a share-link invite token for the current room. Requires the room token
 * (from create/join) in localStorage. Returns { success, data: { invite } }.
 */
export async function createInvite() {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}/rooms/invite`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || 'Failed to create invite link')
  }

  return res.json()
}

/**
 * Exchange an invite token for a member token (stored for subsequent auth).
 * Returns { success: true, data: { code } }.
 */
export async function redeemInvite(invite) {
  const res = await fetch(`${BASE_URL}/rooms/redeem-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || 'Invalid or expired invite link')
  }

  const token = res.headers.get('Authorization')?.split(' ')[1]
  if (token) {
    localStorage.setItem('token', token)
  }

  return res.json()
}

/**
 * Mint a short-lived token to embed in the `evodraw://` desktop deep link.
 * The long-lived room token must never travel in a URL (it ends up in the OS
 * protocol handler and the launched process's command line).
 * Returns { success: true, data: { token } }.
 */
export async function createOverlayToken() {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}/rooms/overlay-token`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || 'Failed to create overlay token')
  }

  return res.json()
}

/**
 * Upload a file (image, etc.) to Firebase Storage via the server.
 * Returns { success: true, data: { fileId, url, originalName } }
 */
export async function uploadFile(roomCode, file) {
  const formData = new FormData()
  formData.append('file', file)

  const token = localStorage.getItem('token')
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/rooms/${roomCode}/files`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to upload file')
  }

  return res.json()
}
