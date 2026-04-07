import Room from '../models/Room.js';
import crypto from 'crypto';

// Utility to generate a 6-character uppercase alphanumeric code
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Utility to generate a 4-digit PIN
function generateRoomPasscode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function createRoom(req, res) {
    try {
        let code = generateRoomCode();
        let isUnique = false;
        let attempts = 0;

        // Ensure uniqueness (simple retry logic)
        while (!isUnique && attempts < 5) {
            const existingRoom = await Room.findByCode(code);
            if (!existingRoom) {
                isUnique = true;
            } else {
                code = generateRoomCode();
                attempts++;
            }
        }

        if (!isUnique) {
            return res.status(500).json({ success: false, message: 'Failed to generate unique room code' });
        }

        const passcode = generateRoomPasscode();

        const newRoom = {
            code: code,
            passcode: passcode,
        };

        const result = await Room.create(newRoom);
        
        res.status(201).json({
            success: true,
            data: {
                _id: result.insertedId,
                ...newRoom
            }
        });
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

export async function joinRoom(req, res) {
    try {
        const { code, passcode } = req.body || {};

        const room = await Room.verifyAccess(code, passcode);

        if (!room) {
            return res.status(401).json({ success: false, message: 'Invalid room code or passcode.' });
        }

        await Room.touch(code);

        const { passcode: _hash, ...safeRoom } = room;
        res.status(200).json({
            success: true,
            data: safeRoom,
        });
    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}


