import express from 'express';
import { createRoom, joinRoom, createInvite, redeemInvite, createOverlayToken } from '../controllers/room.controller.js';
import { validateRoom } from '../middlewares/room.middleware.js';
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

// POST /api/rooms/overlay-token - Mint a short-lived token for the evodraw:// deep link
router.post('/overlay-token', validateToken, createOverlayToken);

// NOTE: PUT /update was removed. It replaced room.elements directly in MongoDB,
// bypassing the authoritative in-memory document (services/roomDocument.js), its
// LWW rule and its tombstones — so the next flush would clobber the write (or the
// write would clobber the board). No client called it. Persistence is server-owned.

export default router;
