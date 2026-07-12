import express from 'express';
import { createRoom, joinRoom, updateRoom, createInvite, redeemInvite } from '../controllers/room.controller.js';
import { validateRoom, validateUpdateRoom } from '../middlewares/room.middleware.js';
import { validateToken } from '../middlewares/auth.middleware.js';
import { joinRateLimiter } from '../middlewares/rateLimit.middleware.js';

const router = express.Router();

// POST /api/rooms - Create a new room
router.post('/', createRoom);

// POST /api/rooms/join - Join a room (rate-limited against passcode brute-force)
router.post('/join', joinRateLimiter, validateRoom, joinRoom);

// POST /api/rooms/invite - Mint a share-link invite token (caller must hold a room token)
router.post('/invite', validateToken, createInvite);

// POST /api/rooms/redeem-invite - Exchange an invite token for a member token (rate-limited)
router.post('/redeem-invite', joinRateLimiter, redeemInvite);

// PUT /api/rooms/update - Update room data
router.put('/update', validateToken, validateUpdateRoom, updateRoom);

export default router;
