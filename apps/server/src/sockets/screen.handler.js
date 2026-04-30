import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

export const registerScreenShareHandlers = (io, socket) => {
    // Presenter starts sharing
    // Expected payload: { roomId: string, shareId: string }
    socket.on('screen:start', ({ roomId, shareId }) => {
        if (!roomId || !shareId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        const username = socket.data.username || 'Anonymous';

        if (!socket.data.shares) socket.data.shares = new Set();
        socket.data.shares.add(shareId);

        console.log(`[Screen] ${username} started sharing (${shareId}) in room ${roomId}`);
        markRoomActivity(roomId);

        // Notify all other users in the room
        socket.to(roomId).emit('screen:started', {
            socketId: socket.id,
            shareId,
            username,
        });
    });

    // Presenter stops sharing
    // Expected payload: { roomId: string, shareId: string }
    socket.on('screen:stop', ({ roomId, shareId }) => {
        if (!roomId || !shareId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        if (socket.data.shares) {
            socket.data.shares.delete(shareId);
        }

        console.log(`[Screen] Share stopped (${shareId}) in room ${roomId}`);
        markRoomActivity(roomId);

        socket.to(roomId).emit('screen:stopped', { shareId });
    });

    // Late joiner requests active shares list
    socket.on('screen:get_active', async ({ roomId }) => {
        if (!roomId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        try {
            const sockets = await io.in(roomId).fetchSockets();
            const list = [];
            for (const s of sockets) {
                if (s.data.shares && s.data.shares.size > 0) {
                    for (const shareId of s.data.shares) {
                        list.push({
                            shareId,
                            socketId: s.id,
                            username: s.data.username || 'Anonymous'
                        });
                    }
                }
            }
            socket.emit('screen:active_list', { shares: list });
        } catch (err) {
            console.error('Error fetching active shares:', err);
            socket.emit('screen:active_list', { shares: [] });
        }
    });

    // Cleanup on disconnect: remove all shares from this socket
    socket.on('disconnect', () => {
        const { roomId } = socket.data;
        if (!roomId || !socket.data.shares || socket.data.shares.size === 0) return;

        // Notify room about each stopped share
        for (const shareId of socket.data.shares) {
            io.to(roomId).emit('screen:stopped', { shareId });
            console.log(`[Screen] Auto-stopped share (${shareId}) on disconnect`);
        }
        
        socket.data.shares.clear();
    });
};
