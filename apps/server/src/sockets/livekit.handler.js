import { AccessToken } from 'livekit-server-sdk';
import { ensureAuthorizedRoom } from '../utils/guard.js';

const handleGetToken = (io, socket) => async ({ roomId, username }, callback) => {
    try {
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) {
            if (callback) callback({ error: 'Unauthorized room access' });
            return;
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !livekitUrl) {
            console.error('[LiveKit] API key, secret, or URL not configured');
            if (callback) callback({ error: 'LiveKit not configured on server' });
            return;
        }

        const identity = `${username || 'Anonymous'}-${socket.id.slice(-4)}`;

        const token = new AccessToken(apiKey, apiSecret, {
            identity,
            name: username || 'Anonymous',
        });

        token.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
        });

        const jwt = await token.toJwt();

        console.log(`[LiveKit] Token issued for ${identity} in room ${roomId}`);
        if (callback) {
            callback({ token: jwt, url: livekitUrl });
        }
    } catch (error) {
        console.error('[LiveKit] Error generating token:', error);
        if (callback) callback({ error: 'Failed to generate LiveKit token' });
    }
};

export const registerLiveKitHandlers = (io, socket) => {
    socket.on('livekit:get-token', handleGetToken(io, socket));
};
