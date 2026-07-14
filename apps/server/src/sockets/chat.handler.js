import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';
import { allowEvent } from '../utils/eventRateLimiter.js';

// Chat is fanned out to every member, so both fields must be bounded — an
// unbounded message (up to the 10 MB socket buffer) is a room-wide DoS.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_USERNAME_LENGTH = 64;

// Text Chat Message Handler
const handleChatMessage = (io, socket) => async (data) => {
    try {
        const roomCode = readRoomCode(data);
        const { message } = data;

        if (!roomCode || typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
            return;
        }

        try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

        if (!allowEvent(socket, 'chat:message', { capacity: 10, refillPerSec: 2 })) return;

        // Create a payload for broadcasting
        const payload = {
            sender: typeof data.username === 'string' && data.username
                ? data.username.slice(0, MAX_USERNAME_LENGTH)
                : 'Anonymous',
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
