import { useState } from 'react'
import './WelcomeOverlay.css'

export default function WelcomeOverlay({ onJoinRoom }) {
  const [roomCode, setRoomCode] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = roomCode.trim()
    if (trimmed) onJoinRoom(trimmed)
  }

  return (
    <div className="welcome">
      <h1 className="welcome-title">EvoDraw</h1>

      <p className="welcome-desc">
        Your drawings are saved in your browser's storage.<br />
        Browser storage can be cleared unexpectedly.<br />
        Save your work to a file regularly to avoid losing it.
      </p>

      <form className="welcome-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter room ID"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          autoComplete="off"
        />
        <button type="submit">Join</button>
      </form>
    </div>
  )
}
