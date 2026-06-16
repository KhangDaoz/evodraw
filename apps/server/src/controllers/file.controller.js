import { uploadRoomFile } from '../services/storage.service.js';

/**
 * Upload a file to Firebase Storage and return its public URL.
 * POST /api/rooms/:roomId/files
 */
export async function uploadFile(req, res) {
    try {
        const { roomId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file provided.' });
        }

        if (!roomId) {
            return res.status(400).json({ success: false, error: 'Room ID is required.' });
        }

        const data = await uploadRoomFile({ roomId, file });

        return res.status(201).json({ success: true, data });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ success: false, error: err.message });
        }
        console.error('File upload error:', err);
        return res.status(500).json({ success: false, error: 'Failed to upload file.' });
    }
}
