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
    const shutdown = async (signal, exitCode = 0) => {
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
            process.exit(exitCode);
        }
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));

    // A crash would otherwise take every unflushed edit (up to one flush interval)
    // with it. Try to persist, then exit non-zero so the supervisor restarts us —
    // the process state is undefined after this point, so we must not keep serving.
    process.once('uncaughtException', (err) => {
        console.error('[Fatal] Uncaught exception:', err);
        shutdown('uncaughtException', 1);
    });
    process.once('unhandledRejection', (reason) => {
        console.error('[Fatal] Unhandled rejection:', reason);
        shutdown('unhandledRejection', 1);
    });
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
            // Invite tokens are a share-link credential, not a session: they must be
            // exchanged for a member token via REST /redeem-invite. Accepting one here
            // would let a raw invite link connect directly and bypass that exchange.
            // (Overlay tokens ARE accepted — they exist precisely to open a socket.)
            if (decoded.purpose === 'invite') {
                return next(new Error('Authentication error: Invite must be redeemed first'));
            }
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
