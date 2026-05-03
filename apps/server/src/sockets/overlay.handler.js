import { ensureAuthorizedRoom } from '../utils/guard.js';

export const registerOverlayHandlers = (io, socket) => {
    // Presenter adds an annotation stroke from the desktop overlay
    socket.on('overlay:stroke:add', ({ roomId, shareId, stroke }) => {
        if (!roomId || !shareId || !stroke) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        // Broadcast to all other users in the room
        socket.to(roomId).emit('overlay:stroke:added', {
            shareId,
            stroke,
            username: socket.data.username || 'Presenter',
        });
    });

    // Presenter removes a single stroke (undo or eraser)
    socket.on('overlay:stroke:remove', ({ roomId, shareId, strokeId }) => {
        if (!roomId || !shareId || !strokeId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        socket.to(roomId).emit('overlay:stroke:removed', {
            shareId,
            strokeId,
        });
    });

    // Presenter clears all overlay strokes
    socket.on('overlay:stroke:clear', ({ roomId, shareId }) => {
        if (!roomId || !shareId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }

        socket.to(roomId).emit('overlay:stroke:cleared', { shareId });
    });
};
