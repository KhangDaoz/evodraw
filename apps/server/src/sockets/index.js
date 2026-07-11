import { registerRoomHandlers } from './room.handler.js';
import { registerDrawHandlers } from './draw.handler.js';
import { registerChatHandlers } from './chat.handler.js';
import { registerLiveKitHandlers } from './livekit.handler.js';
import { registerScreenShareHandlers } from './screen.handler.js';
import { verifyToken } from '../services/token.service.js';
import { flushAllDirty, startRoomDocLoop, stopRoomDocLoop } from '../services/roomDocument.js';

const AUTHORITATIVE = process.env.AUTHORITATIVE_SYNC !== 'false';

let shuttingDown = false;

// On deploy/restart (Render sends SIGTERM), persist any unsaved room documents
// before exiting so in-memory edits aren't lost.
function registerGracefulShutdown() {
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[Sync] ${signal} received — flushing room documents...`);
        try {
            stopRoomDocLoop();
            await flushAllDirty();
            console.log('[Sync] Flush complete.');
        } catch (err) {
            console.error('[Sync] Flush on shutdown failed:', err.message);
        } finally {
            process.exit(0);
        }
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

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
                // Legacy wire key: accept `roomId` from tokens issued before the rename.
                roomCode: decoded.roomCode ?? decoded.roomId,
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
        registerLiveKitHandlers(io, socket);
        registerScreenShareHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    if (AUTHORITATIVE) {
        startRoomDocLoop();
        registerGracefulShutdown();
    }
};
