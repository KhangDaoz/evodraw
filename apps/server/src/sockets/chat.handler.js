import { markRoomActivity } from './room.activity.js';

export const registerChatHandlers = (io, socket) => {
    // Text Chat Message Header
    socket.on('chat:message', async (data) => {
        try {
            const { roomId, message } = data;
            
            if (!roomId || !message) {
                return;
            }

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
    });

    // WebRTC Signaling Handlers
    socket.on('webrtc:offer', (data) => {
        const { targetSocketId, offer, senderName } = data;
        if (targetSocketId) {
            socket.to(targetSocketId).emit('webrtc:offer', {
                fromSocketId: socket.id,
                senderName,
                offer
            });
        }
    });

    socket.on('webrtc:answer', (data) => {
        const { targetSocketId, answer } = data;
        if (targetSocketId) {
            socket.to(targetSocketId).emit('webrtc:answer', {
                fromSocketId: socket.id,
                answer
            });
        }
    });

    socket.on('webrtc:ice-candidate', (data) => {
        const { targetSocketId, candidate } = data;
        if (targetSocketId) {
            socket.to(targetSocketId).emit('webrtc:ice-candidate', {
                fromSocketId: socket.id,
                candidate
            });
        }
    });
};
