import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage/LandingPage'
import RoomPage from './pages/RoomPage/RoomPage'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:roomCode" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
