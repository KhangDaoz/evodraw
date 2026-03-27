import express from 'express';
import { createRoom, joinRoom } from '../controllers/room.controller.js';
import { validateCreateRoom, validateJoinRoom } from '../middlewares/room.middleware.js';

const router = express.Router();

// POST /api/rooms - Create a new room
router.post('/', validateCreateRoom, createRoom);

// POST /api/rooms/join - Join a room securely using code and passcode
router.post('/join', validateJoinRoom, joinRoom);

export default router;
