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
 * Upload a file (image, etc.) to Firebase Storage via the server.
 * Returns { success: true, data: { fileId, url, originalName } }
 */
export async function uploadFile(roomId, file) {
  const formData = new FormData()
  formData.append('file', file)

  const token = localStorage.getItem('token')
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/rooms/${roomId}/files`, {
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

/**
 * Get all files for a room.
 * Returns { success: true, data: [{ fileId, url, originalName, mimetype, size, createdAt }] }
 */
export async function getFilesByRoom(roomId) {
  const token = localStorage.getItem('token')
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}/rooms/${roomId}/files`, {
    headers
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to fetch files')
  }

  return res.json()
}
