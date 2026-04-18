import express from 'express';
import { createScene, joinScene } from '../controllers/scene.controller.js';
import { validateJoinRoom } from '../middlewares/scene.middleware.js';

const router = express.Router();

// Create a new scene
router.post('/', createScene);

// Join an existing scene
router.post('/join', validateJoinRoom, joinScene);

export default router;
