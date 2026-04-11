import Scene from '../models/Scene.js';

// Validate joinRoom request
export function validateJoinRoom(req, res, next) {
    const { roomId, roomKey } = req.body || {};
    
    if (!roomId || typeof roomId !== 'string' || roomId.length !== 6) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid format: "roomId" must be exactly a 6-character string.' 
        });
    }

    // Checking strictly 4 digits
    if (!roomKey || typeof roomKey !== 'string' || roomKey.length !== 4 || !/^\d{4}$/.test(roomKey)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid format: "roomKey" must be exactly a 4-digit numeric string.' 
        });
    }

    next();
}