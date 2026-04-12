import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage/LandingPage'
import RoomPage from './pages/RoomPage/RoomPage'
import JoinPage from './pages/JoinPage/JoinPage'
import './App.css'

// Apply persisted theme immediately to prevent flash
const savedTheme = localStorage.getItem('evodraw_theme') || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:roomCode" element={<RoomPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
