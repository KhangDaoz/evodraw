const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

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
