import jwt from 'jsonwebtoken';

export function generateRoomToken(roomId, role = 'member') {
    const token = jwt.sign(
        { 
            roomId,
            role           // 'creator' hoặc 'member'
        },
        process.env.TOKEN_SECRET,
        { expiresIn: '24h' }
    );
    return token;
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.TOKEN_SECRET);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}