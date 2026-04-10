import express from 'express';
import { getScene, createScene } from '../controllers/scene.controller.js';

const router = express.Router();

router.get('/:roomId', getScene);

router.post('/', createScene);

export default router;
