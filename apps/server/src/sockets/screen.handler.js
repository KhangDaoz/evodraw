import { markRoomActivity } from './room.activity.js';

// In-memory: roomId -> Map<shareId, { socketId, username }>
const activeShares = new Map();

export const registerScreenShareHandlers = (io, socket) => {
    // Presenter starts sharing
    // Expected payload: { roomId: string, shareId: string }
    socket.on('screen:start', ({ roomId, shareId }) => {
        if (!roomId || !shareId) return;

        const username = socket.data.username || 'Anonymous';

        if (!activeShares.has(roomId)) activeShares.set(roomId, new Map());
        activeShares.get(roomId).set(shareId, { socketId: socket.id, username });

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

        activeShares.get(roomId)?.delete(shareId);
        if (activeShares.get(roomId)?.size === 0) activeShares.delete(roomId);

        console.log(`[Screen] Share stopped (${shareId}) in room ${roomId}`);
        markRoomActivity(roomId);

        socket.to(roomId).emit('screen:stopped', { shareId });
    });

    // Late joiner requests active shares list
    socket.on('screen:get_active', ({ roomId }) => {
        if (!roomId) return;

        const shares = activeShares.get(roomId);
        const list = shares
            ? Array.from(shares.entries()).map(([shareId, info]) => ({
                  shareId,
                  socketId: info.socketId,
                  username: info.username,
              }))
            : [];

        socket.emit('screen:active_list', { shares: list });
    });

    // Cleanup on disconnect: remove all shares from this socket
    socket.on('disconnect', () => {
        const { roomId } = socket.data;
        if (!roomId || !activeShares.has(roomId)) return;

        const shares = activeShares.get(roomId);
        const removedIds = [];

        for (const [shareId, info] of shares.entries()) {
            if (info.socketId === socket.id) {
                removedIds.push(shareId);
                shares.delete(shareId);
            }
        }

        if (shares.size === 0) activeShares.delete(roomId);

        // Notify room about each stopped share
        for (const shareId of removedIds) {
            io.to(roomId).emit('screen:stopped', { shareId });
            console.log(`[Screen] Auto-stopped share (${shareId}) on disconnect`);
        }
    });
};
