import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { redeemInvite } from '../../services/api'
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

        // Exchange the invite token for a member token (stored by redeemInvite).
        // The passcode is never in the link and never returned to the joiner —
        // the member token alone authorizes the socket join.
        const { data } = await redeemInvite(token)
        const roomCode = data.code

        if (isMounted) {
          const username = localStorage.getItem('evodraw_username') || generateAnonymousName()
          navigate(`/room/${roomCode.toUpperCase()}`, {
            state: { username, fromInvite: true },
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
