import rateLimit from 'express-rate-limit';

// Limit room-join attempts to slow passcode brute-forcing.
// 4-digit passcodes have only 10k combinations, so the cap must be low.
// Keyed on client IP; failed and successful attempts both count.
export const joinRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,                 // 20 join attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many join attempts. Please try again later.' },
});
