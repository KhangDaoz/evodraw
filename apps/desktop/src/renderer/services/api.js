let _serverUrl = 'http://localhost:4000';

export function setServerUrl(url) {
  _serverUrl = url;
}

export async function createRoom() {
  const res = await fetch(`${_serverUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create room');
  }

  const token = res.headers.get('Authorization')?.split(' ')[1];
  if (token) localStorage.setItem('token', token);

  return res.json();
}

export async function joinRoom(code, passcode) {
  const res = await fetch(`${_serverUrl}/api/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), passcode }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Invalid room code or passcode');
  }

  const token = res.headers.get('Authorization')?.split(' ')[1];
  if (token) localStorage.setItem('token', token);

  return res.json();
}
