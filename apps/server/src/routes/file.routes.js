import { Router } from 'express';
import multer from 'multer';
import { uploadFile, getFilesByRoom } from '../controllers/file.controller.js';

// Use memory storage — files go to Firebase, not local disk
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max per file
    },
    fileFilter: (req, file, cb) => {
        // Allow images and common document types
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
        }
    },
});

const router = Router({ mergeParams: true });

// POST /api/rooms/:roomId/files — upload a file
router.post('/', upload.single('file'), uploadFile);

// GET /api/rooms/:roomId/files — list files for a room
router.get('/', getFilesByRoom);

export default router;
