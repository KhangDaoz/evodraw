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

  return res.json()
}

/**
 * Upload a file (image, etc.) to Firebase Storage via the server.
 * Returns { success: true, data: { fileId, url, originalName } }
 */
export async function uploadFile(roomId, file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/rooms/${roomId}/files`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to upload file')
  }

  return res.json()
}

/**
 * Get all files for a room.
 * Returns { success: true, data: [{ fileId, url, originalName, mimetype, size, createdAt }] }
 */
export async function getFilesByRoom(roomId) {
  const res = await fetch(`${BASE_URL}/rooms/${roomId}/files`)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to fetch files')
  }

  return res.json()
}
