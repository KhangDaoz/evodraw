import { Router } from 'express';
import multer from 'multer';
import { uploadFile } from '../controllers/file.controller.js';
import { validateToken } from '../middlewares/auth.middleware.js';

// Use memory storage — files go to Firebase, not local disk
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max per file
    },
    fileFilter: (req, file, cb) => {
        // Allow images and common document types.
        // SVG is intentionally excluded: SVGs can carry <script> and would be a
        // stored-XSS vector when served publicly from the bucket.
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
        }
    },
});

// Ensure the caller's token authorizes the room in the URL before uploading.
function ensureRoomMatches(req, res, next) {
    if (req.roomId !== req.params.roomId) {
        return res.status(403).json({ success: false, error: 'Token does not authorize this room.' });
    }
    next();
}

const router = Router({ mergeParams: true });

// POST /api/rooms/:roomId/files — upload a file (auth required)
router.post('/', validateToken, ensureRoomMatches, upload.single('file'), uploadFile);

export default router;

