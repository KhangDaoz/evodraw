import { getBucket } from '../config/firebase.js';
import { getDB } from '../config/db.js';
import { randomUUID } from 'crypto';

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

        // Save metadata to MongoDB
        const db = getDB();
        const fileDoc = {
            fileId,
            roomId: roomId.toUpperCase(),
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            storagePath,
            url,
            createdAt: new Date(),
        };
        await db.collection('files').insertOne(fileDoc);

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

        const db = getDB();
        const files = await db
            .collection('files')
            .find(
                { roomId: roomId.toUpperCase() },
                { projection: { _id: 0, fileId: 1, url: 1, originalName: 1, mimetype: 1, size: 1, createdAt: 1 } },
            )
            .sort({ createdAt: -1 })
            .toArray();

        return res.json({ success: true, data: files });
    } catch (err) {
        next(err);
    }
}
