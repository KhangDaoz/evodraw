import { markRoomActivity } from './room.activity.js';

export const registerRoomHandlers = (io, socket) => {
    socket.on('join_room', ({ roomId, username }) => {
        socket.join(roomId);
        console.log(`User ${username} joined room ${roomId}`);
        markRoomActivity(roomId, { force: true });
        
        // Broadcast to everyone ELSE in the room
        socket.to(roomId).emit('user_joined', { username, roomId });
    });

    socket.on('leave_room', ({ roomId, username }) => {
        socket.leave(roomId);
        console.log(`User ${username} left room ${roomId}`);
        markRoomActivity(roomId, { force: true });
        
        socket.to(roomId).emit('user_left', { username, roomId });
    });
};
