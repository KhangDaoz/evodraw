import crypto from 'crypto';

// Generate a 6-character uppercase alphanumeric code
export function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Generate a 4-digit PIN passcode
export function generateRoomPassCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
