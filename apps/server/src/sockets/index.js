import { registerRoomHandlers } from './room.handler.js';
import { registerDrawHandlers } from './draw.handler.js';

export const initializeSockets = (io) => {
    console.log('Socket.IO initialized globally');
    
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Register domain-specific handlers
        registerRoomHandlers(io, socket);
        registerDrawHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });
};
