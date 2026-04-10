import Scene from '../models/Scene.js';

// Validate roomId
export const validateRoomId = (req, res, next) => {
  const { roomId } = req.params || req.body;
  
  if (!roomId || roomId.trim() === '') {
    return res.status(400).json({message: 'roomId is required'});
  }
  
  next();
};