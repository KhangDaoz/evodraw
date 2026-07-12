import { createRoomService, getRoom, updateRoomService } from '../services/room.service.js';
import { generateRoomToken, generateInviteToken, verifyInviteToken } from '../services/token.service.js';

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
    try {
        const { code, passcode } = req.body || {};
        const room = await getRoom({ code, passcode });

        const token = generateRoomToken(room.code, 'member');

        res.set('Authorization', `Bearer ${token}`);

        res.status(200).json({
            success: true,
            data: room,
        });
    } catch (error) {
        if (error.statusCode) {
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

export async function updateRoom(req, res) {
    try {
        const { elements, appState, status } = req.body || {};
        // Use the room code from the verified token instead of the request body
        const roomCode = req.roomCode;
        // roomVersion is intentionally not forwarded: the server owns versioning
        // (updateRoomService bumps its own monotonic counter), so a client value is ignored.
        await updateRoomService({ code: roomCode, elements, appState, status });

        res.status(200).json({
            success: true,
            message: 'Room updated successfully',
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }

        console.error('Update room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}