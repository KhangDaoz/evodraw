import { markRoomActivity } from '../utils/roomActivity.js';
import { verifyRoomAccess } from '../services/room.service.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

// In-memory brute-force guard for socket joins, keyed on client IP.
// Mirrors the REST joinRateLimiter; resets on restart (acceptable, like other in-memory state).
const JOIN_WINDOW_MS = 5 * 60 * 1000;
const JOIN_MAX_ATTEMPTS = 20;
const joinAttempts = new Map(); // ip -> { count, resetAt }

function isJoinBlocked(ip) {
    const now = Date.now();
    const entry = joinAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        joinAttempts.set(ip, { count: 1, resetAt: now + JOIN_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > JOIN_MAX_ATTEMPTS;
}

async function joinRoom(io, socket, payload) {
    const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const passcode = typeof payload?.passcode === 'string' ? payload.passcode.trim() : '';

    if (isJoinBlocked(socket.handshake.address)) {
        socket.emit('room_error', { message: 'Too many join attempts. Please try again later.' });
        return;
    }

    if (!roomId || roomId.length !== 6 || !passcode || !/^\d{4}$/.test(passcode)) {
        socket.emit('room_error', { message: 'Invalid room code or passcode format.' });
        return;
    }

    try {
        if (!await verifyRoomAccess({ code: roomId, passcode })) {
            socket.emit('room_error', { message: 'Invalid room code or passcode.' });
            return;
        }
    } catch (error) {
        console.error('Socket join_room error:', error);
        socket.emit('room_error', { message: 'Failed to verify room access.' });
        return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    console.log(`User ${username} joined room ${roomId}`);
    markRoomActivity(roomId, { force: true });

    socket.to(roomId).emit('user_joined', { username, roomId, socketId: socket.id });
    broadcastRoomUsers(io, roomId);
}

function leaveRoom(io, socket, { roomId, username }) {
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
    socket.leave(roomId);
    socket.data.roomId = null;

    console.log(`User ${username} left room ${roomId}`);
    markRoomActivity(roomId, { force: true });

    socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
    broadcastRoomUsers(io, roomId);
}

function updateUsername(io, socket, { roomId, newUsername }) {
    if (!roomId || !newUsername) return;
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

    const oldUsername = socket.data.username;
    socket.data.username = newUsername;

    console.log(`User ${oldUsername} changed name to ${newUsername} in room ${roomId}`);

    socket.to(roomId).emit('user_name_changed', { socketId: socket.id, oldUsername, newUsername });

    broadcastRoomUsers(io, roomId);
}


function joinRoomOverlay(io, socket, { roomId, username }) {
    const authRoomId = socket.data?.auth?.roomId?.toString();
    if (!authRoomId || authRoomId !== (roomId || '').toString()) {
        socket.emit('room_error', { message: 'Token does not authorize this room.' });
        return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username || 'Presenter';
    socket.data.isOverlay = true;

    console.log(`[Overlay] ${socket.data.username} joined room ${roomId} via overlay`);
    markRoomActivity(roomId, { force: true });

    socket.emit('room_joined', { roomId });
    socket.to(roomId).emit('user_joined', { username: socket.data.username, roomId, socketId: socket.id });
    broadcastRoomUsers(io, roomId);
}

function onOverlayReady(socket, { roomId, shareId }) {
    if (!roomId || !shareId) return;
    socket.to(roomId).emit('overlay:ready', { shareId });
}

function onDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    if (roomId) {
        socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
        broadcastRoomUsers(io, roomId);
    }
}

async function getRoomUsers(io, roomId) {
    try {
        const sockets = await io.in(roomId).fetchSockets();
        return sockets
            .filter(s => !s.data.isOverlay)
            .map(s => ({
                socketId: s.id,
                username: s.data.username
            }));
    } catch (err) {
        console.error('Error fetching sockets:', err);
        return [];
    }
}

async function broadcastRoomUsers(io, roomId) {
    const users = await getRoomUsers(io, roomId);
    io.to(roomId).emit('room_users', { users });
}

export const registerRoomHandlers = (io, socket) => {
    socket.on('join_room',        (payload) => joinRoom(io, socket, payload));
    socket.on('update_username',  (data)    => updateUsername(io, socket, data));
    socket.on('leave_room',       (data)    => leaveRoom(io, socket, data));
    socket.on('join_room_overlay',(data)    => joinRoomOverlay(io, socket, data));
    socket.on('overlay:ready',    (data)    => onOverlayReady(socket, data));
    socket.on('disconnect',       ()        => onDisconnect(io, socket));
};
