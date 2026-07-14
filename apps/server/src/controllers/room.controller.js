import { createRoomService, getRoom } from '../services/room.service.js';
import { generateRoomToken, generateInviteToken, verifyInviteToken, generateOverlayToken } from '../services/token.service.js';
import { isRoomLocked, recordFailure, clearFailures } from '../utils/joinLimiter.js';

export async function createRoom(req, res) {
    try {
        const result = await createRoomService();

        const token = generateRoomToken(result.code, 'creator');

        res.set('Authorization', `Bearer ${token}`);

        res.status(201).json({
            success: true,
            data: {
                _id: result._id,
                code: result.code,
                passcode: result.passcode,
            }
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }

        console.error('Create room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

export async function joinRoom(req, res) {
    const { code, passcode } = req.body || {};
    try {
        // Per-room failure budget, shared with the socket join path (the limiter
        // normalizes the code, so both paths hit the same bucket).
        if (isRoomLocked(code)) {
            return res.status(429).json({ success: false, message: 'Too many join attempts. Please try again later.' });
        }

        const room = await getRoom({ code, passcode });
        clearFailures(code);

        const token = generateRoomToken(room.code, 'member');

        res.set('Authorization', `Bearer ${token}`);

        res.status(200).json({
            success: true,
            data: room,
        });
    } catch (error) {
        if (error.statusCode) {
            if (error.statusCode === 401) recordFailure(code);
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }

        console.error('Join room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

// Issue a short-lived invite token for the caller's room. Auth: validateToken has
// already verified the caller holds a room JWT and set req.roomCode.
export async function createInvite(req, res) {
    try {
        const roomCode = req.roomCode;
        if (!roomCode) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }
        const invite = generateInviteToken(roomCode);
        res.status(200).json({ success: true, data: { invite } });
    } catch (error) {
        console.error('Create invite error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

// Redeem an invite token → a normal member token, without requiring the passcode
// (the invite itself is the proof of access). The socket join_room handler accepts
// this member token directly, so the passcode never has to travel to the joiner.
export async function redeemInvite(req, res) {
    try {
        const { invite } = req.body || {};
        if (!invite || typeof invite !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid invite.' });
        }

        let roomCode;
        try {
            roomCode = verifyInviteToken(invite);
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Invalid or expired invite link.' });
        }

        // Confirm the room still exists (invites outlive TTL-deleted rooms).
        const room = await getRoom({ code: roomCode, skipPasscodeCheck: true });
        if (!room) {
            return res.status(404).json({ success: false, message: 'This room no longer exists.' });
        }

        const token = generateRoomToken(room.code, 'member');
        res.set('Authorization', `Bearer ${token}`);

        res.status(200).json({
            success: true,
            data: { code: room.code },
        });
    } catch (error) {
        console.error('Redeem invite error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

// Mint a short-lived token for the `evodraw://` deep link. The link travels through
// the OS protocol handler and the target process's command line, so embedding the
// 24h member token there leaked long-lived room access; this one expires in minutes
// and the desktop swaps it for a normal member token once it joins.
export async function createOverlayToken(req, res) {
    try {
        const roomCode = req.roomCode;
        if (!roomCode) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }
        const token = generateOverlayToken(roomCode);
        res.status(200).json({ success: true, data: { token } });
    } catch (error) {
        console.error('Create overlay token error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}