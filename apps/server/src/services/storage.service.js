import { getBucket } from '../config/firebase.js';
import { randomUUID } from 'crypto';

// Canonical extension per allowed MIME type. The extension is derived from the
// (multer-validated) mimetype rather than the client-supplied filename, which
// avoids object-name injection via crafted originalnames (e.g. "x/../../y").
const EXT_BY_MIME = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
};

function httpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * Upload a room file to Firebase Storage and return its public URL.
 * Throws errors carrying a `statusCode` for the controller to map.
 *
 * @param {{ roomId: string, file: { buffer: Buffer, mimetype: string, originalname: string } }} args
 * @returns {Promise<{ fileId: string, url: string, originalName: string }>}
 */
export async function uploadRoomFile({ roomId, file }) {
    const bucket = getBucket();
    if (!bucket) {
        throw httpError(
            'File storage is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_STORAGE_BUCKET.',
            503,
        );
    }

    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
        throw httpError('Unsupported file type.', 400);
    }

    const fileId = randomUUID();
    const storagePath = `rooms/${roomId}/${fileId}.${ext}`;

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

    return { fileId, url, originalName: file.originalname };
}
