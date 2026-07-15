const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Throw the server's message (falling back to `fallback`) on a non-2xx response.
async function throwIfNotOk(res, fallback) {
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  throw new Error(body.message || body.error || fallback)
}

// The server returns freshly minted room tokens in the Authorization header.
function storeTokenFromResponse(res) {
  const token = res.headers.get('Authorization')?.split(' ')[1]
  if (token) {
    localStorage.setItem('token', token)
  }
}

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function createRoom() {
  const res = await fetch(`${BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  await throwIfNotOk(res, 'Failed to create room')
  storeTokenFromResponse(res)
  return res.json()
}

export async function joinRoom(code, passcode) {
  const res = await fetch(`${BASE_URL}/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), passcode }),
  })

  await throwIfNotOk(res, 'Invalid room code or passcode')
  storeTokenFromResponse(res)
  return res.json()
}

/**
 * Mint a share-link invite token for the current room. Requires the room token
 * (from create/join) in localStorage. Returns { success, data: { invite } }.
 */
export async function createInvite() {
  const res = await fetch(`${BASE_URL}/rooms/invite`, {
    method: 'POST',
    headers: authHeaders(),
  })

  await throwIfNotOk(res, 'Failed to create invite link')
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

  await throwIfNotOk(res, 'Invalid or expired invite link')
  storeTokenFromResponse(res)
  return res.json()
}

/**
 * Mint a short-lived token to embed in the `evodraw://` desktop deep link.
 * The long-lived room token must never travel in a URL (it ends up in the OS
 * protocol handler and the launched process's command line).
 * Returns { success: true, data: { token } }.
 */
export async function createOverlayToken() {
  const res = await fetch(`${BASE_URL}/rooms/overlay-token`, {
    method: 'POST',
    headers: authHeaders(),
  })

  await throwIfNotOk(res, 'Failed to create overlay token')
  return res.json()
}

/**
 * Upload a file (image, etc.) to Firebase Storage via the server.
 * Returns { success: true, data: { fileId, url, originalName } }
 */
export async function uploadFile(roomCode, file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/rooms/${roomCode}/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  await throwIfNotOk(res, 'Failed to upload file.')
  return res.json()
}
