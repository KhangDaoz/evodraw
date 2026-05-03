import { registerRoomHandlers } from './room.handler.js';
import { registerDrawHandlers } from './draw.handler.js';
import { registerChatHandlers } from './chat.handler.js';
import { registerScreenShareHandlers } from './screen.handler.js';
import { registerOverlayHandlers } from './overlay.handler.js';
import { verifyToken } from '../services/token.service.js';

export const initializeSockets = (io) => {
    console.log('Socket.IO initialized globally');

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication error: Token missing'));
        }
        
        try {
            const decoded = verifyToken(token);
            socket.data.auth = {
                roomId: decoded.roomId,
                role: decoded.role
            };
            next();
        } catch (error) {
            next(new Error('Authentication error: Invalid or expired token'));
        }
    });
    
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Register domain-specific handlers
        registerRoomHandlers(io, socket);
        registerDrawHandlers(io, socket);
        registerChatHandlers(io, socket);
        registerScreenShareHandlers(io, socket);
        registerOverlayHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });
};
