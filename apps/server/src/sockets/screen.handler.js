import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

// Presenter starts sharing
const handleScreenStart = (io, socket) => ({ roomId, shareId, displaySurface }) => {
    if (!roomId || !shareId) return;
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

    const username = socket.data.username || 'Anonymous';

    if (!socket.data.shares) socket.data.shares = new Map();
    socket.data.shares.set(shareId, { displaySurface });

    console.log(`[Screen] ${username} started sharing (${shareId}) in room ${roomId}`);
    markRoomActivity(roomId);

    // Notify all other users in the room
    socket.to(roomId).emit('screen:started', {
        socketId: socket.id,
        shareId,
        username,
        displaySurface,
    });
};

// Presenter stops sharing
const handleScreenStop = (io, socket) => ({ roomId, shareId }) => {
    if (!roomId || !shareId) return;
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

    if (socket.data.shares) {
        socket.data.shares.delete(shareId);
    }

    console.log(`[Screen] Share stopped (${shareId}) in room ${roomId}`);
    markRoomActivity(roomId);

    socket.to(roomId).emit('screen:stopped', { shareId });
};

// Late joiner requests active shares list
const handleGetActive = (io, socket) => async ({ roomId }) => {
    if (!roomId) return;
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

    try {
        const sockets = await io.in(roomId).fetchSockets();
        const list = [];
        for (const s of sockets) {
            if (s.data.shares && s.data.shares.size > 0) {
                for (const shareId of s.data.shares.keys()) {
                    list.push({
                        shareId,
                        socketId: s.id,
                        username: s.data.username || 'Anonymous',
                        displaySurface: s.data.shares.get(shareId)?.displaySurface,
                    });
                }
            }
        }
        socket.emit('screen:active_list', { shares: list });
    } catch (err) {
        console.error('Error fetching active shares:', err);
        socket.emit('screen:active_list', { shares: [] });
    }
};

// Cleanup on disconnect: remove all shares from this socket
const handleDisconnect = (io, socket) => () => {
    const { roomId } = socket.data;
    if (!roomId || !socket.data.shares || socket.data.shares.size === 0) return;

    // Notify room about each stopped share
    for (const shareId of socket.data.shares.keys()) {
        io.to(roomId).emit('screen:stopped', { shareId });
        console.log(`[Screen] Auto-stopped share (${shareId}) on disconnect`);
    }

    socket.data.shares.clear();
};

export const registerScreenShareHandlers = (io, socket) => {
    socket.on('screen:start', handleScreenStart(io, socket));
    socket.on('screen:stop', handleScreenStop(io, socket));
    socket.on('screen:get_active', handleGetActive(io, socket));
    socket.on('disconnect', handleDisconnect(io, socket));
};
