const express = require('express');
const router = express.Router();
const roomController = require('../controllers/room.controller');
const roomMiddleware = require('../middlewares/room.middleware');

// POST /api/rooms - Create a new room
router.post('/', roomMiddleware.validateCreateRoom, roomController.createRoom);

// POST /api/rooms/join - Join a room securely using code and passcode
router.post('/join', roomMiddleware.validateJoinRoom, roomController.joinRoom);

module.exports = router;
