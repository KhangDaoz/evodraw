import { getBucket } from '../config/firebase.js';
import { randomUUID } from 'crypto';

/**
 * Upload a file to Firebase Storage and return its public URL.
 * POST /api/rooms/:roomId/files
 */
export async function uploadFile(req, res, next) {
    try {
        const { roomId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file provided.' });
        }

        if (!roomId) {
            return res.status(400).json({ success: false, error: 'Room ID is required.' });
        }

        const bucket = getBucket();
        if (!bucket) {
            return res.status(503).json({
                success: false,
                error: 'File storage is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_STORAGE_BUCKET.',
            });
        }

        // Generate unique file path in Firebase Storage
        const fileId = randomUUID();
        const ext = file.originalname.split('.').pop() || 'bin';
        const storagePath = `rooms/${roomId}/${fileId}.${ext}`;

        // Upload to Firebase Storage
        const bucketFile = bucket.file(storagePath);
        await bucketFile.save(file.buffer, {
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    roomId,
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString(),
                },
            },
        });

        // Make the file publicly accessible (for canvas embedding)
        await bucketFile.makePublic();
        const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        return res.status(201).json({
            success: true,
            data: { fileId, url, originalName: file.originalname },
        });
    } catch (err) {
        next(err);
    }
}
