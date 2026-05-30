import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 500 requests per windowMs
    message: { success: false, message: 'Too many requests, please try again later.' }
});

export const createRoomLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // limit each IP to 20 rooms per hour
    message: { success: false, message: 'Too many rooms created, please try again later.' }
});
