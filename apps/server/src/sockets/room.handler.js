import { markRoomActivity } from '../utils/roomActivity.js';
import { verifyRoomAccess } from '../services/room.service.js';
import { ensureAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';
import { evictRoom } from '../services/roomDocument.js';

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
    const rawCode = readRoomCode(payload);
    const roomCode = typeof rawCode === 'string' ? rawCode.trim() : '';
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const passcode = typeof payload?.passcode === 'string' ? payload.passcode.trim() : '';

    if (isJoinBlocked(socket.handshake.address)) {
        socket.emit('room_error', { message: 'Too many join attempts. Please try again later.' });
        return;
    }

    // If the socket's JWT already authorizes this room, trust it and skip the
    // redundant passcode re-check. The token is only issued after a passcode check
    // (REST /join) or an invite redemption (REST /redeem-invite), and every other
    // socket event already trusts it via ensureAuthorizedRoom. This is what lets an
    // invite-link joiner connect without the passcode ever leaving the server.
    let tokenAuthorizes = false;
    try { ensureAuthorizedRoom(socket, roomCode); tokenAuthorizes = true; } catch (e) { tokenAuthorizes = false; }

    if (!tokenAuthorizes) {
        // Fallback for any client whose token doesn't match: verify the passcode.
        if (!roomCode || roomCode.length !== 6 || !passcode || !/^\d{4}$/.test(passcode)) {
            socket.emit('room_error', { message: 'Invalid room code or passcode format.' });
            return;
        }

        try {
            if (!await verifyRoomAccess({ code: roomCode, passcode })) {
                socket.emit('room_error', { message: 'Invalid room code or passcode.' });
                return;
            }
        } catch (error) {
            console.error('Socket join_room error:', error);
            socket.emit('room_error', { message: 'Failed to verify room access.' });
            return;
        }
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.username = username;

    console.log(`User ${username} joined room ${roomCode}`);
    markRoomActivity(roomCode, { force: true });

    socket.to(roomCode).emit('user_joined', { username, roomCode, socketId: socket.id });
    broadcastRoomUsers(io, roomCode);
}

function leaveRoom(io, socket, payload) {
    const roomCode = readRoomCode(payload);
    const username = payload?.username;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    socket.leave(roomCode);
    socket.data.roomCode = null;

    console.log(`User ${username} left room ${roomCode}`);
    markRoomActivity(roomCode, { force: true });

    socket.to(roomCode).emit('user_left', { username, roomCode, socketId: socket.id });
    broadcastRoomUsers(io, roomCode);
    evictIfEmpty(io, roomCode);
}

// Flush + drop the in-memory authoritative document once a room has no sockets
// left. Runs after the socket has already left/disconnected, so fetchSockets
// reflects the post-departure membership.
async function evictIfEmpty(io, roomCode) {
    if (!roomCode) return;
    try {
        const sockets = await io.in(roomCode).fetchSockets();
        if (sockets.length === 0) await evictRoom(roomCode);
    } catch (err) {
        console.error(`[Room] evictIfEmpty error for ${roomCode}:`, err.message);
    }
}

function updateUsername(io, socket, payload) {
    const roomCode = readRoomCode(payload);
    const newUsername = payload?.newUsername;
    if (!roomCode || !newUsername) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    const oldUsername = socket.data.username;
    socket.data.username = newUsername;

    console.log(`User ${oldUsername} changed name to ${newUsername} in room ${roomCode}`);

    socket.to(roomCode).emit('user_name_changed', { socketId: socket.id, oldUsername, newUsername });

    broadcastRoomUsers(io, roomCode);
}


function joinRoomOverlay(io, socket, payload) {
    const roomCode = readRoomCode(payload);
    const username = payload?.username;
    const authRoomCode = socket.data?.auth?.roomCode?.toString();
    if (!authRoomCode || authRoomCode !== (roomCode || '').toString()) {
        socket.emit('room_error', { message: 'Token does not authorize this room.' });
        return;
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.username = username || 'Presenter';
    socket.data.isOverlay = true;

    console.log(`[Overlay] ${socket.data.username} joined room ${roomCode} via overlay`);
    markRoomActivity(roomCode, { force: true });

    socket.emit('room_joined', { roomCode });
    socket.to(roomCode).emit('user_joined', { username: socket.data.username, roomCode, socketId: socket.id });
    broadcastRoomUsers(io, roomCode);
}

function onOverlayReady(socket, payload) {
    const roomCode = readRoomCode(payload);
    const shareId = payload?.shareId;
    if (!roomCode || !shareId) return;
    socket.to(roomCode).emit('overlay:ready', { shareId });
}

function onDisconnect(io, socket) {
    const { roomCode, username } = socket.data;
    if (roomCode) {
        socket.to(roomCode).emit('user_left', { username, roomCode, socketId: socket.id });
        broadcastRoomUsers(io, roomCode);
        evictIfEmpty(io, roomCode);
    }
}

async function getRoomUsers(io, roomCode) {
    try {
        const sockets = await io.in(roomCode).fetchSockets();
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

async function broadcastRoomUsers(io, roomCode) {
    const users = await getRoomUsers(io, roomCode);
    io.to(roomCode).emit('room_users', { users });
}

export const registerRoomHandlers = (io, socket) => {
    socket.on('join_room',        (payload) => joinRoom(io, socket, payload));
    socket.on('update_username',  (data)    => updateUsername(io, socket, data));
    socket.on('leave_room',       (data)    => leaveRoom(io, socket, data));
    socket.on('join_room_overlay',(data)    => joinRoomOverlay(io, socket, data));
    socket.on('overlay:ready',    (data)    => onOverlayReady(socket, data));
    socket.on('disconnect',       ()        => onDisconnect(io, socket));
};
