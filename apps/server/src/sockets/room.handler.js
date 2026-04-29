import { markRoomActivity } from '../utils/roomActivity.js';
import Room from '../models/Room.js';
import bcrypt from 'bcrypt';
import { ensureAuthorizedRoom } from '../utils/guard.js';

async function getRoomUsers(io, roomId) {
    try {
        const sockets = await io.in(roomId).fetchSockets();
        return sockets.map(s => ({
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
    socket.on('join_room', async (payload) => {

        const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
        const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
        const passcode = typeof payload?.passcode === 'string' ? payload.passcode.trim() : '';

        if (!roomId || roomId.length !== 6 || !passcode || !/^\d{4}$/.test(passcode)) {
            socket.emit('room_error', { message: 'Invalid room code or passcode format.' });
            return;
        }

        try {
            const room = await Room.findOne({ code: roomId.toUpperCase() });
            if (!room || !await bcrypt.compare(passcode, room.passcode)) {
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
    });

    socket.on('update_username', ({ roomId, newUsername }) => {
        if (!roomId || !newUsername) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        const oldUsername = socket.data.username;
        socket.data.username = newUsername;

        console.log(`User ${oldUsername} changed name to ${newUsername} in room ${roomId}`);

        // Broadcast the new name to others
        socket.to(roomId).emit('user_name_changed', { socketId: socket.id, oldUsername, newUsername });

        // Broadcast updated user list
        broadcastRoomUsers(io, roomId);
    });

    socket.on('leave_room', ({ roomId, username }) => {
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
        socket.leave(roomId);
        socket.data.roomId = null;

        console.log(`User ${username} left room ${roomId}`);
        markRoomActivity(roomId, { force: true });

        socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
        broadcastRoomUsers(io, roomId);
    });

    socket.on('disconnect', () => {
        const { roomId, username } = socket.data;
        if (roomId) {
            socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
            broadcastRoomUsers(io, roomId);
        }
    });
};
