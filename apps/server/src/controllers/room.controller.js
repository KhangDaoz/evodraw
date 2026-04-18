import Room from '../models/Room.js';
import bcrypt from 'bcrypt';
import { generateRoomCode, generateRoomPassCode } from '../utils/codeGenerator.js';

export async function createRoom(req, res) {
    try {
        let code = generateRoomCode();
        let isUnique = false;
        let attempts = 0;

        // Ensure uniqueness (simple retry logic)
        while (!isUnique && attempts < 5) {
            const existingRoom = await Room.findOne({ code });
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

        const passcode = generateRoomPassCode();

        const hashedPasscode = await bcrypt.hash(passcode, 10);

        const result = await Room.create({
            code: code,
            passcode: hashedPasscode,
        });

        res.status(201).json({
            success: true,
            data: {
                _id: result._id,
                code: result.code,
                passcode: passcode, // return the plain passcode, not the hash
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

        const room = await Room.findOne({
            code: code.toUpperCase(),
        });

        if (!room || !await bcrypt.compare(passcode, room.passcode)) {
            return res.status(401).json({ success: false, message: 'Invalid room code or passcode.' });
        }

        room.updatedAt = new Date();
        await room.save();

        const roomObj = room.toObject();
        const { passcode: _hash, ...safeRoom } = roomObj;

        res.status(200).json({
            success: true,
            data: safeRoom,
        });
    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

export async function updateRoom(req, res) {
    try {
        const { code, passcode, roomVersion, elements, appState, status } = req.body || {};

        const room = await Room.findOne({
            code: code.toUpperCase(),
        });

        if (!room || !await bcrypt.compare(passcode, room.passcode)) {
            return res.status(401).json({ success: false, message: 'Invalid room code or passcode.' });
        }

        if (roomVersion !== undefined && roomVersion > room.roomVersion)  {
            room.roomVersion = roomVersion;
            room.elements = elements || room.elements;
            room.appState = appState || room.appState;
            room.status = status || room.status;
            await room.save();
            res.status(200).json({
                success: true,
                message: 'Room updated successfully',
            });
        }

        else {
            return res.status(400).json({
                success: false,
                message: 'Room version is outdated. Please refresh to get the latest room.' 
            });
        }
    } catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}