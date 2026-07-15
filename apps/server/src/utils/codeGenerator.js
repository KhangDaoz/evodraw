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

// Accepted passcode shape (REST validation and socket join share this).
// 4–6 chars is transitional: legacy rooms have 4-digit numeric passcodes and
// TTL out within 24h; new passcodes are 6-char alphanumeric. Can tighten to
// {6} after one TTL window. Case-insensitive; the service uppercases.
export const PASSCODE_PATTERN = /^[A-Za-z0-9]{4,6}$/;
