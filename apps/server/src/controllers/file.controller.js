import { getBucket } from '../config/firebase.js';
import File from '../models/File.js';
import { randomUUID } from 'crypto';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Upload a file to Firebase Storage and save metadata to MongoDB.
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

        const type = await fileTypeFromBuffer(file.buffer);
        const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'image/svg+xml'];

        if (!type || !allowedMimes.includes(type.mime)) {
            return res.status(400).json({ success: false, error: 'Invalid file type detected.' });
        }

        // Generate unique file path in Firebase Storage
        const fileId = randomUUID();
        const ext = type.ext || 'bin';
        const storagePath = `rooms/${roomId}/${fileId}.${ext}`;

        // Upload to Firebase Storage
        const bucketFile = bucket.file(storagePath);
        await bucketFile.save(file.buffer, {
            metadata: {
                contentType: type.mime,
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

        // Save metadata to MongoDB
        await File.create({
            fileId,
            roomId: roomId.toUpperCase(),
            mimeType: file.mimetype,
            size: file.size,
            dataURL: url,
        });

        return res.status(201).json({
            success: true,
            data: { fileId, url, originalName: file.originalname },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * List all files for a room.
 * GET /api/rooms/:roomId/files
 */
export async function getFilesByRoom(req, res, next) {
    try {
        const { roomId } = req.params;
        if (!roomId) {
            return res.status(400).json({ success: false, error: 'Room ID is required.' });
        }

        const files = await File
            .find({ roomId: roomId.toUpperCase() })
            .select('-_id fileId dataURL mimeType size created')
            .sort({ created: -1 })
            .lean();

        // format map properties back to 'url' because the client might expect it (or we can just leave it as is if client relies on 'url')
        const formattedFiles = files.map(f => ({
            ...f,
            url: f.dataURL,
            mimetype: f.mimeType,
            createdAt: f.created,
        }));

        return res.json({ success: true, data: formattedFiles });
    } catch (err) {
        next(err);
    }
}
