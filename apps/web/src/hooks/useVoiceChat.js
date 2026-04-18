import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export default function useVoiceChat(roomId, currentUsername) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [streams, setStreams] = useState({}); // { socketId: MediaStream }
  
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // { socketId: RTCPeerConnection }
  const iceCandidateQueues = useRef({}); // { socketId: RTCIceCandidateInit[] }
  
  const usernameRef = useRef(currentUsername);
  useEffect(() => {
    usernameRef.current = currentUsername;
  }, [currentUsername]);

  // Cleanup a specific peer connection
  const cleanupPeer = useCallback((socketId) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
      delete peersRef.current[socketId];
    }
    setStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[socketId];
      return newStreams;
    });
    delete iceCandidateQueues.current[socketId];
  }, []);

  // Cleanup all connections
  const cleanupAll = useCallback(() => {
    Object.keys(peersRef.current).forEach(cleanupPeer);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, [cleanupPeer]);

  const processIceQueue = useCallback(async (socketId, pc) => {
    const queue = iceCandidateQueues.current[socketId];
    if (queue && queue.length > 0 && pc.remoteDescription) {
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding queued ice candidate", err);
        }
      }
      iceCandidateQueues.current[socketId] = [];
    }
  }, []);

  const toggleVoice = useCallback(async () => {
    if (isVoiceActive) {
      // Turn off voice
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        
        // Remove track from all existing peer connections
        Object.entries(peersRef.current).forEach(([socketId, pc]) => {
          const senders = pc.getSenders();
          senders.forEach(sender => pc.removeTrack(sender));
          
          // Renegotiate to stop sending media
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer).then(() => offer))
            .then(offer => {
              const socket = getSocket();
              if (socket) {
                socket.emit('webrtc:offer', {
                  targetSocketId: socketId,
                  offer,
                  senderName: usernameRef.current
                });
              }
            })
            .catch(err => console.error("Renegotiation failed", err));
        });
        
        localStreamRef.current = null;
      }
      setIsVoiceActive(false);
    } else {
      // Turn on voice
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        
        // Add track to all existing peer connections
        Object.entries(peersRef.current).forEach(([socketId, pc]) => {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
          
          // Renegotiate to send new media
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer).then(() => offer))
            .then(offer => {
              const socket = getSocket();
              if (socket) {
                socket.emit('webrtc:offer', {
                  targetSocketId: socketId,
                  offer,
                  senderName: usernameRef.current
                });
              }
            })
            .catch(err => console.error("Renegotiation failed", err));
        });
        
        setIsVoiceActive(true);
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setIsVoiceActive(false);
      }
    }
  }, [isVoiceActive]);

  // Create a new RTCPeerConnection and bind events
  const createPeerConnection = useCallback((targetSocketId) => {
    const socket = getSocket();
    if (peersRef.current[targetSocketId]) {
       return peersRef.current[targetSocketId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[targetSocketId] = pc;

    // Force an audio transceiver from the start so the connection negotiates properly
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // Add local tracks if we already have them active
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc:ice-candidate', {
          targetSocketId,
          candidate: event.candidate
        });
      }
    };

    // Handle receiving a remote stream
    pc.ontrack = (event) => {
      setStreams(prev => ({
        ...prev,
        [targetSocketId]: event.streams[0]
      }));
    };

    // Handle connection state changes for cleanup
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        cleanupPeer(targetSocketId);
      }
    };

    return pc;
  }, [cleanupPeer]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // 1. Existing user sees a new user join -> Initiates Offer
    const handleUserJoined = async ({ socketId }) => {
      if (!socketId || socketId === socket.id) return;
      
      const pc = createPeerConnection(socketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', { 
          targetSocketId: socketId, 
          offer,
          senderName: usernameRef.current 
        });
      } catch (err) {
        console.error("Error creating WebRTC offer", err);
      }
    };

    const handleUserLeft = ({ socketId }) => {
      if (socketId) cleanupPeer(socketId);
    };

    // 2. New user receives an offer from an existing user -> Responds with Answer
    const handleReceiveOffer = async ({ fromSocketId, offer }) => {
      const pc = createPeerConnection(fromSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        processIceQueue(fromSocketId, pc); // Process any ICE candidates that arrived early

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          targetSocketId: fromSocketId,
          answer
        });
      } catch (err) {
        console.error("Error responding to WebRTC offer", err);
      }
    };

    // 3. Existing user receives the answer back
    const handleReceiveAnswer = async ({ fromSocketId, answer }) => {
      const pc = peersRef.current[fromSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          processIceQueue(fromSocketId, pc); // Process any ICE candidates that arrived early
        } catch (err) {
          console.error("Error setting remote description from answer", err);
        }
      }
    };

    // 4. Exchange ICE Candidates
    const handleReceiveIceCandidate = async ({ fromSocketId, candidate }) => {
      if (!candidate) return;
      const pc = peersRef.current[fromSocketId];

      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ice candidate", err);
        }
      } else {
        if (!iceCandidateQueues.current[fromSocketId]) {
          iceCandidateQueues.current[fromSocketId] = [];
        }
        iceCandidateQueues.current[fromSocketId].push(candidate);
      }
    };

    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('webrtc:offer', handleReceiveOffer);
    socket.on('webrtc:answer', handleReceiveAnswer);
    socket.on('webrtc:ice-candidate', handleReceiveIceCandidate);

    return () => {
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('webrtc:offer', handleReceiveOffer);
      socket.off('webrtc:answer', handleReceiveAnswer);
      socket.off('webrtc:ice-candidate', handleReceiveIceCandidate);
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeerConnection, cleanupPeer, cleanupAll, processIceQueue]);

  return {
    isVoiceActive,
    toggleVoice,
    streams
  };
}
