import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';

export default function useChat(roomId, currentUsername) {
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
  }, [roomId, handleIncomingMessage]);

  const sendMessage = useCallback((text) => {
    const socket = getSocket();
    if (socket && text.trim()) {
      socket.emit('chat:message', { roomId, message: text, username: usernameRef.current });
      setMessages((prev) => [
        ...prev,
        { sender: usernameRef.current, text: text, timestamp: Date.now() }
      ]);
    }
  }, [roomId]);

  return { messages, sendMessage };
}
