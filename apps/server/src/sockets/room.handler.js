import { markRoomActivity } from './room.activity.js';
import Room from '../models/Room.js';

// roomId -> Map<socketId, username>
const roomMembers = new Map();

function getRoomUsernames(roomId) {
    const members = roomMembers.get(roomId);
    if (!members) return [];
    return [...new Set(members.values())];
}

function broadcastRoomUsers(io, roomId) {
    io.to(roomId).emit('room_users', { users: getRoomUsernames(roomId) });
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
            const room = await Room.verifyAccess(roomId, passcode);
            if (!room) {
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

        if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
        roomMembers.get(roomId).set(socket.id, username);

        console.log(`User ${username} joined room ${roomId}`);
        markRoomActivity(roomId, { force: true });

        socket.to(roomId).emit('user_joined', { username, roomId, socketId: socket.id });
        broadcastRoomUsers(io, roomId);
    });

    socket.on('update_username', ({ roomId, newUsername }) => {
        if (!roomId || !newUsername) return;
        
        const oldUsername = socket.data.username;
        socket.data.username = newUsername;
        
        if (roomMembers.has(roomId)) {
            roomMembers.get(roomId).set(socket.id, newUsername);
        }

        console.log(`User ${oldUsername} changed name to ${newUsername} in room ${roomId}`);
        
        // Broadcast the new name to others
        socket.to(roomId).emit('user_name_changed', { socketId: socket.id, oldUsername, newUsername });
        
        // Broadcast updated user list
        broadcastRoomUsers(io, roomId);
    });

    socket.on('leave_room', ({ roomId, username }) => {
        socket.leave(roomId);
        roomMembers.get(roomId)?.delete(socket.id);
        socket.data.roomId = null;

        console.log(`User ${username} left room ${roomId}`);
        markRoomActivity(roomId, { force: true });

        socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
        broadcastRoomUsers(io, roomId);
    });

    socket.on('disconnect', () => {
        const { roomId, username } = socket.data;
        if (roomId) {
            roomMembers.get(roomId)?.delete(socket.id);
            socket.to(roomId).emit('user_left', { username, roomId, socketId: socket.id });
            broadcastRoomUsers(io, roomId);
        }
    });
};
