const Room = require('../models/Room');
const crypto = require('crypto');

// Utility to generate a 6-character uppercase alphanumeric code
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Utility to generate a 4-digit PIN
function generateRoomPasscode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

async function createRoom(req, res) {
    try {
        const { name } = req.body || {};
        
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
            name: name || `Room-${code}`,
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

async function joinRoom(req, res) {
    try {
        const { code, passcode } = req.body || {};

        const room = await Room.verifyAccess(code.toUpperCase(), passcode);

        if (!room) {
            return res.status(401).json({ success: false, message: 'Invalid room code or passcode.' });
        }

        // Extend the room's life by updating `updatedAt`
        await Room.touch(code.toUpperCase());

        res.status(200).json({
            success: true,
            data: room
        });
    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

module.exports = {
    createRoom,
    joinRoom
};
