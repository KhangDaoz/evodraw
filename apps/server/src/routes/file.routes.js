import { Router } from 'express';
import multer from 'multer';
import { uploadFile } from '../controllers/file.controller.js';
import { validateToken } from '../middlewares/auth.middleware.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
        }
    },
});

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

