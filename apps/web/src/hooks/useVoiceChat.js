import { useState, useEffect, useCallback } from 'react'
import { RoomEvent, Track } from 'livekit-client'

/**
 * Voice chat hook powered by LiveKit.
 *
 * Replaces the old P2P WebRTC implementation. Instead of managing
 * RTCPeerConnections, ICE candidates, and SDP offers/answers manually,
 * this hook toggles the microphone on the shared LiveKit Room.
 * Remote audio tracks are exposed as MediaStreams so RoomPage can
 * render them in hidden <audio> elements (same interface as before).
 *
 * @param {import('livekit-client').Room} room - Shared LiveKit Room from useLiveKitRoom
 * @returns {{ isVoiceActive: boolean, toggleVoice: () => Promise<void>, streams: Object }}
 */
export default function useVoiceChat(room) {
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [streams, setStreams] = useState({}) // { participantIdentity: MediaStream }

  // Toggle local microphone on/off
  const toggleVoice = useCallback(async () => {
    if (!room) {
      console.warn('[VoiceChat] No LiveKit room available')
      return
    }

    try {
      const newState = !isVoiceActive
      await room.localParticipant.setMicrophoneEnabled(newState)
      setIsVoiceActive(newState)
      console.log(`[VoiceChat] Microphone ${newState ? 'enabled' : 'disabled'}`)
    } catch (err) {
      console.error('[VoiceChat] Failed to toggle microphone:', err)
    }
  }, [room, isVoiceActive])

  // Subscribe to remote audio tracks
  useEffect(() => {
    if (!room) return

    const handleTrackSubscribed = (track, publication, participant) => {
      // Only handle microphone audio tracks (not screen share audio)
      if (track.kind !== Track.Kind.Audio || track.source !== Track.Source.Microphone) {
        return
      }

      console.log(`[VoiceChat] Audio track subscribed from ${participant.name}`)

      // Wrap the underlying MediaStreamTrack in a MediaStream for RoomPage compatibility
      const mediaStream = new MediaStream([track.mediaStreamTrack])
      setStreams(prev => ({
        ...prev,
        [`${participant.identity}_${track.sid}`]: mediaStream,
      }))
    }

    const handleTrackUnsubscribed = (track, publication, participant) => {
      if (track.kind !== Track.Kind.Audio || track.source !== Track.Source.Microphone) {
        return
      }

      console.log(`[VoiceChat] Audio track unsubscribed from ${participant.name}`)

      setStreams(prev => {
        const next = { ...prev }
        delete next[`${participant.identity}_${track.sid}`]
        return next
      })
    }

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
    }
  }, [room])

  // Disable mic on unmount
  useEffect(() => {
    return () => {
      if (room?.localParticipant) {
        room.localParticipant.setMicrophoneEnabled(false).catch(() => {})
      }
    }
  }, [room])

  return {
    isVoiceActive,
    toggleVoice,
    streams,
  }
}
