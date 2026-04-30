import { verifyToken } from '../services/token.service.js';

export function validateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1]; 

    if(!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = verifyToken(token);
        req.roomId = decoded.roomId;
        next();
    }
    catch (error) {
        console.error('Token verification error:', error);
        res.status(400).json({ success: false, message: 'Invalid token.' });
    }
}