import { AccessToken } from 'livekit-server-sdk';
import { ensureAuthorizedRoom } from '../utils/guard.js';

// LiveKit Token Generator
// Shared by voice chat (useVoiceChat) and screen share (useScreenShare) on the
// web client: both reuse a single LiveKit Room created from this one token.
// Clients request a JWT to connect to the LiveKit SFU for voice/video/screen tracks.
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

        // Identity must be unique per participant in a room.
        // Append a short socket-id suffix to handle duplicate usernames.
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
