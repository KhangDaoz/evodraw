import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';

export default function useChat(roomCode, currentUsername) {
  const [messages, setMessages] = useState([]);

  const usernameRef = useRef(currentUsername);
  useEffect(() => {
    usernameRef.current = currentUsername;
  }, [currentUsername]);

  const handleIncomingMessage = useCallback((messageData) => {
    setMessages((prev) => [...prev, messageData]);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('chat:message', handleIncomingMessage);

    setMessages([
      { system: true, text: `Welcome to the chat, ${usernameRef.current}!` }
    ]);

    return () => {
      socket.off('chat:message', handleIncomingMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, handleIncomingMessage]);

  const sendMessage = useCallback((text) => {
    const socket = getSocket();
    if (socket && text.trim()) {
      socket.emit('chat:message', { roomCode, message: text, username: usernameRef.current });
      // Optimistic: show our own message immediately (the server only broadcasts to others)
      setMessages((prev) => [
        ...prev,
        { sender: usernameRef.current, text: text, timestamp: Date.now() }
      ]);
    }
  }, [roomCode]);

  return { messages, sendMessage };
}
