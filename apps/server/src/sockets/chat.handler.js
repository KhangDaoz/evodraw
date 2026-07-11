import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';

// Text Chat Message Handler
const handleChatMessage = (io, socket) => async (data) => {
    try {
        const roomCode = readRoomCode(data);
        const { message } = data;

        if (!roomCode || !message) {
            return;
        }

        try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

        // Create a payload for broadcasting
        const payload = {
            sender: data.username || 'Anonymous',
            text: message,
            timestamp: Date.now()
        };

        // Broadcast to everyone else in the room
        socket.to(roomCode).emit('chat:message', payload);
        await markRoomActivity(roomCode);
    } catch (error) {
        console.error('Error handling chat:message:', error);
    }
};

export const registerChatHandlers = (io, socket) => {
    socket.on('chat:message', handleChatMessage(io, socket));
};
