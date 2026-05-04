import { useState } from 'react';
import { createRoom, joinRoom } from '../services/api';
import { generateAnonymousName } from '../utils/nameGenerator';

export default function LandingPage({ serverUrl, onServerUrlChange, onJoin }) {
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [username, setUsername] = useState(() => localStorage.getItem('evodraw_username') || generateAnonymousName());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl);

  const saveUsername = (name) => {
    setUsername(name);
    localStorage.setItem('evodraw_username', name);
  };

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await createRoom();
      const { code } = res.data;
      onJoin({ roomId: code, username });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || !passcode.trim()) { setError('Room code and passcode required'); return; }
    setLoading(true);
    setError('');
    try {
      await joinRoom(roomCode.trim(), passcode.trim());
      onJoin({ roomId: roomCode.trim().toUpperCase(), username });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveServer = () => {
    onServerUrlChange(serverInput.trim() || 'http://localhost:4000');
    window.electronAPI.saveSettings({ serverUrl: serverInput.trim() || 'http://localhost:4000' });
    setShowServer(false);
  };

  return (
    <div className="landing-root">
      <div className="landing-card">
        {/* Header */}
        <div className="landing-header">
          <div className="landing-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e03131" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            <span>EvoDraw</span>
          </div>
          <button className="server-btn" onClick={() => setShowServer(v => !v)} title="Server settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        </div>

        {/* Server URL row */}
        {showServer && (
          <div className="server-row">
            <input
              type="text"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://localhost:4000"
              className="landing-input"
            />
            <button className="btn-secondary-sm" onClick={saveServer}>Save</button>
          </div>
        )}

        {/* Username */}
        <div className="username-row">
          <label>Your name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => saveUsername(e.target.value)}
            placeholder="Display name"
            className="landing-input"
            maxLength={32}
          />
        </div>

        {/* Tabs */}
        <div className="tab-row">
          <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>Create Room</button>
          <button className={`tab-btn ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>Join Room</button>
        </div>

        {error && <p className="landing-error">{error}</p>}

        {tab === 'create' ? (
          <div className="tab-content">
            <p className="tab-desc">Start a new whiteboard session and share the code with others.</p>
            <button className="btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : '+ Create Room'}
            </button>
          </div>
        ) : (
          <form className="tab-content" onSubmit={handleJoin}>
            <input
              type="text"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="landing-input"
              autoComplete="off"
            />
            <input
              type="text"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              maxLength={4}
              inputMode="numeric"
              className="landing-input"
              autoComplete="off"
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        )}

        <p className="hotkey-hint">Use <kbd>Ctrl+Shift+D</kbd> to toggle drawing mode</p>
      </div>
    </div>
  );
}
