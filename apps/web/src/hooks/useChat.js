import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';

export default function useChat(roomId, username) {
  const [messages, setMessages] = useState([]);

  const handleIncomingMessage = useCallback((messageData) => {
    setMessages((prev) => [...prev, messageData]);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('chat:message', handleIncomingMessage);

    // Initial system message
    setMessages([
      { system: true, text: `Welcome to the chat, ${username}!` }
    ]);

    return () => {
      socket.off('chat:message', handleIncomingMessage);
    };
  }, [roomId, username, handleIncomingMessage]);

  const sendMessage = useCallback((text) => {
    const socket = getSocket();
    if (socket && text.trim()) {
      socket.emit('chat:message', { roomId, message: text, username });
      // Predictively add to own UI
      setMessages((prev) => [
        ...prev, 
        { sender: username, text: text, timestamp: Date.now() }
      ]);
    }
  }, [roomId, username]);

  return { messages, sendMessage };
}
