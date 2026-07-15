// Read the room code from a socket payload.
// Legacy wire key: older/installed clients (notably packaged desktop builds that
// can't be force-updated) still send `roomId`. Accept both; remove the `roomId`
// fallback once every client is known to send `roomCode`.
export const readRoomCode = (payload) => payload?.roomCode ?? payload?.roomId;

// Canonical form of a room code (codes are stored/compared uppercase).
export const normalizeRoomCode = (code) => String(code || '').trim().toUpperCase();

// Throw unless the socket's token authorizes the given room code.
function ensureAuthorizedRoom(socket, roomCode) {
    const authRoomCode = socket.data?.auth?.roomCode;
    if (!authRoomCode) {
        throw new Error('Unauthorized: No room membership found');
    }

    // Compare as strings to avoid type mismatch.
    const requested = (roomCode ?? '').toString();
    if (authRoomCode.toString() !== requested) {
        throw new Error(`Unauthorized: Socket membership (${authRoomCode}) does not match requested room (${requested})`);
    }

    return true;
}

// Non-throwing variant for handlers that silently drop unauthorized events.
export function isAuthorizedRoom(socket, roomCode) {
    try { return ensureAuthorizedRoom(socket, roomCode); } catch { return false; }
}
