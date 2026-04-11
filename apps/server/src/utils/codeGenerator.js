import crypto from 'crypto';

// Generate a 6-character uppercase alphanumeric roomId
export function generateRoomId() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Generate a 4-digit PIN roomKey
export function generateRoomKey() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
