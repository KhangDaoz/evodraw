import express from 'express';
import { createRoom, joinRoom, updateRoom } from '../controllers/room.controller.js';
import { validateRoom, validateUpdateRoom } from '../middlewares/room.middleware.js';

const router = express.Router();

// POST /api/rooms - Create a new room
router.post('/', createRoom);

// POST /api/rooms/join - Join a room
router.post('/join', validateRoom, joinRoom);

// PUT /api/rooms/update - Update room data
router.put('/update', validateRoom, validateUpdateRoom, updateRoom);

export default router;
