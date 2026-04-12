import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { joinRoom } from '../../services/api'
import { generateAnonymousName } from '../../utils/nameGenerator'
import './JoinPage.css'

export default function JoinPage() {
  const { token } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const attemptJoin = async () => {
      try {
        if (!token) throw new Error('Invalid invite link')
        
        let decoded
        try {
          decoded = atob(token)
        } catch(e) {
          throw new Error('Malformed invite link')
        }

        const [roomCode, passcode] = decoded.split(':')
        
        if (!roomCode || !passcode) {
          throw new Error('Invalid link structure')
        }

        // Verify with the backend
        await joinRoom(roomCode, passcode)
        
        if (isMounted) {
          const username = localStorage.getItem('evodraw_username') || generateAnonymousName()
          navigate(`/room/${roomCode.toUpperCase()}`, {
            state: { passcode, username },
            replace: true
          })
        }
      } catch (err) {
        if (isMounted) {
          navigate('/', { state: { error: err.message }, replace: true })
        }
      }
    }

    attemptJoin()
    
    return () => {
      isMounted = false
    }
  }, [token, navigate])

  return (
    <div className="join-page">
      <div className="join-spinner" />
      <p>Joining room...</p>
    </div>
  )
}
