import { useState, useEffect, useCallback, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';

export default function useRoom(serverUrl, roomCode, currentUsername) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [error, setError] = useState(null);
  const hasJoined = useRef(false);
  const usernameRef = useRef(currentUsername);

  useEffect(() => { usernameRef.current = currentUsername; }, [currentUsername]);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setError(null);
    if (!hasJoined.current && roomCode && usernameRef.current) {
      const socket = getSocket();
      // Use overlay join — JWT already proves room access, no passcode needed
      socket.emit('join_room_overlay', { roomId: roomCode, username: usernameRef.current });
      hasJoined.current = true;
    }
  }, [roomCode]);

  const handleDisconnect = useCallback((reason) => {
    setIsConnected(false);
    if (reason === 'io server disconnect') setError('Disconnected by server');
  }, []);

  const handleConnectError = useCallback((err) => {
    setError(`Connection failed: ${err.message}`);
    setIsConnected(false);
  }, []);

  const handleRoomJoined = useCallback(() => {
    setIsConnected(true);
    setError(null);
  }, []);

  const handleRoomError = useCallback((err) => {
    setError(`Access denied: ${err.message}`);
    setIsConnected(false);
    hasJoined.current = false;
  }, []);

  const handleUserJoined = useCallback((user) => {
    setConnectedUsers((prev) =>
      prev.some((u) => u.socketId === user.socketId) ? prev : [...prev, { socketId: user.socketId, username: user.username }]
    );
  }, []);

  const handleUserLeft = useCallback(({ socketId }) => {
    setConnectedUsers((prev) => prev.filter((u) => u.socketId !== socketId));
  }, []);

  const handleRoomUsers = useCallback(({ users }) => {
    const myId = getSocket()?.id;
    setConnectedUsers(users.filter((u) => u.socketId !== myId));
  }, []);

  const updateUsername = useCallback((newUsername) => {
    usernameRef.current = newUsername;
    const socket = getSocket();
    if (socket && isConnected) {
      socket.emit('update_username', { roomId: roomCode, newUsername });
    }
  }, [roomCode, isConnected]);

  useEffect(() => {
    if (!roomCode || !serverUrl) return;

    const socket = connectSocket(serverUrl);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('room_joined', handleRoomJoined);
    socket.on('room_error', handleRoomError);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('room_users', handleRoomUsers);

    if (socket.connected && !hasJoined.current) {
      socket.emit('join_room_overlay', { roomId: roomCode, username: usernameRef.current });
      hasJoined.current = true;
      setIsConnected(true);
    }

    return () => {
      const s = getSocket();
      if (s) {
        s.emit('leave_room', { roomId: roomCode, username: usernameRef.current });
        s.off('connect', handleConnect);
        s.off('disconnect', handleDisconnect);
        s.off('connect_error', handleConnectError);
        s.off('room_joined', handleRoomJoined);
        s.off('room_error', handleRoomError);
        s.off('user_joined', handleUserJoined);
        s.off('user_left', handleUserLeft);
        s.off('room_users', handleRoomUsers);
      }
      hasJoined.current = false;
      disconnectSocket();
    };
  }, [roomCode, serverUrl, handleConnect, handleDisconnect, handleConnectError, handleRoomJoined, handleRoomError, handleUserJoined, handleUserLeft, handleRoomUsers]);

  return { isConnected, connectedUsers, error, updateUsername };
}
