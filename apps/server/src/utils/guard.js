export function ensureAuthorizedRoom(socket, roomId) {
    if (!socket.data?.auth?.roomId) {
        throw new Error('Unauthorized: No room membership found');
    }

    // Convert to string for comparison to avoid type mismatch
    const authRoomId = socket.data.auth.roomId.toString();
    const requestedRoomId = roomId.toString();

    if (authRoomId !== requestedRoomId) {
        throw new Error(`Unauthorized: Socket membership (${authRoomId}) does not match requested room (${requestedRoomId})`);
    }

    return true;
}
