import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

// Text Chat Message Handler
const handleChatMessage = (io, socket) => async (data) => {
    try {
        const { roomId, message } = data;

        if (!roomId || !message) {
            return;
        }

        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        // Create a payload for broadcasting
        const payload = {
            sender: data.username || 'Anonymous',
            text: message,
            timestamp: Date.now()
        };

        // Broadcast to everyone else in the room
        socket.to(roomId).emit('chat:message', payload);
        await markRoomActivity(roomId);
    } catch (error) {
        console.error('Error handling chat:message:', error);
    }
};

export const registerChatHandlers = (io, socket) => {
    socket.on('chat:message', handleChatMessage(io, socket));
};
