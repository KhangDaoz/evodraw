import { markRoomActivity } from '../utils/roomActivity.js';
import { ensureAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';

// Bounds for relayed share metadata (fanned out to every room member).
const MAX_SHARE_ID_LENGTH = 64;
const MAX_DISPLAY_SURFACE_LENGTH = 32;
// A presenter shares one or two surfaces; the cap only stops a client from
// growing the shares Map without bound by inventing unique shareIds.
const MAX_SHARES_PER_SOCKET = 10;

// Presenter starts sharing
// Expected payload: { roomCode: string, shareId: string, displaySurface?: string }
const handleScreenStart = (io, socket) => (payload) => {
    const roomCode = readRoomCode(payload);
    const { shareId } = payload || {};
    if (!roomCode || typeof shareId !== 'string' || shareId.length === 0 || shareId.length > MAX_SHARE_ID_LENGTH) return;
    const displaySurface = typeof payload?.displaySurface === 'string'
        ? payload.displaySurface.slice(0, MAX_DISPLAY_SURFACE_LENGTH)
        : undefined;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    const username = socket.data.username || 'Anonymous';

    if (!socket.data.shares) socket.data.shares = new Map();
    if (socket.data.shares.size >= MAX_SHARES_PER_SOCKET && !socket.data.shares.has(shareId)) return;
    socket.data.shares.set(shareId, { displaySurface });

    console.log(`[Screen] ${username} started sharing (${shareId}) in room ${roomCode}`);
    markRoomActivity(roomCode);

    // Notify all other users in the room
    socket.to(roomCode).emit('screen:started', {
        socketId: socket.id,
        shareId,
        username,
        displaySurface,
    });
};

// Presenter stops sharing
// Expected payload: { roomCode: string, shareId: string }
const handleScreenStop = (io, socket) => (payload) => {
    const roomCode = readRoomCode(payload);
    const { shareId } = payload || {};
    if (!roomCode || typeof shareId !== 'string' || shareId.length > MAX_SHARE_ID_LENGTH) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    if (socket.data.shares) {
        socket.data.shares.delete(shareId);
    }

    console.log(`[Screen] Share stopped (${shareId}) in room ${roomCode}`);
    markRoomActivity(roomCode);

    socket.to(roomCode).emit('screen:stopped', { shareId });
};

// Late joiner requests active shares list
const handleGetActive = (io, socket) => async (payload) => {
    const roomCode = readRoomCode(payload);
    if (!roomCode) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    try {
        const sockets = await io.in(roomCode).fetchSockets();
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
    const { roomCode } = socket.data;
    if (!roomCode || !socket.data.shares || socket.data.shares.size === 0) return;

    // Notify room about each stopped share
    for (const shareId of socket.data.shares.keys()) {
        io.to(roomCode).emit('screen:stopped', { shareId });
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
