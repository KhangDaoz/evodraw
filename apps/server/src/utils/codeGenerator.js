import crypto from 'crypto';

// Generate a 6-character uppercase alphanumeric code
export function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Generate a 6-character uppercase alphanumeric passcode (36^6 ≈ 2.18B combinations).
// crypto.randomInt is CSPRNG-backed and rejects modulo bias.
const PASSCODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PASSCODE_LENGTH = 6;

export function generateRoomPasscode() {
    let passcode = '';
    for (let i = 0; i < PASSCODE_LENGTH; i++) {
        passcode += PASSCODE_CHARS[crypto.randomInt(PASSCODE_CHARS.length)];
    }
    return passcode;
}
