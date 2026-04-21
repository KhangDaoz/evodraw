import { createRoomService, getRoom, updateRoomService } from '../services/room.service.js';

export async function createRoom(req, res) {
    try {
        const result = await createRoomService();

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

export async function updateRoom(req, res) {
    try {
        const { code, passcode, roomVersion, elements, appState, status } = req.body || {};
        await updateRoomService({ code, passcode, roomVersion, elements, appState, status });

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