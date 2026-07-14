import jwt from 'jsonwebtoken';

export function generateRoomToken(roomCode, role = 'member') {
    const token = jwt.sign(
        {
            roomCode,
            role           // 'creator' or 'member'
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

// Invite tokens replace the old base64(roomCode:passcode) share links. The passcode
// is never placed in the URL; possession of a valid, short-lived invite is the proof
// of access, which redeem-invite exchanges for a normal member token.
const INVITE_TOKEN_TTL = process.env.INVITE_TOKEN_TTL || '24h';

export function generateInviteToken(roomCode) {
    return jwt.sign(
        { roomCode, purpose: 'invite' },
        process.env.TOKEN_SECRET,
        { expiresIn: INVITE_TOKEN_TTL }
    );
}

// Overlay tokens are embedded in the `evodraw://` deep link, which transits the OS
// protocol handler and the launched process's command line — both readable by other
// local processes. Keep the window small: the desktop redeems it for a normal member
// token as soon as it joins (see room.handler joinRoomOverlay).
const OVERLAY_TOKEN_TTL = process.env.OVERLAY_TOKEN_TTL || '10m';

export function generateOverlayToken(roomCode) {
    return jwt.sign(
        { roomCode, role: 'member', purpose: 'overlay' },
        process.env.TOKEN_SECRET,
        { expiresIn: OVERLAY_TOKEN_TTL }
    );
}

// Verify an invite token and return its roomCode. Throws on any invalid/expired
// token or one not issued as an invite. Error message is uniform so it doesn't
// leak whether the token was malformed, expired, or the wrong purpose.
export function verifyInviteToken(token) {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    } catch (error) {
        throw new Error('Invalid or expired invite');
    }
    if (decoded.purpose !== 'invite' || !decoded.roomCode) {
        throw new Error('Invalid or expired invite');
    }
    return decoded.roomCode;
}