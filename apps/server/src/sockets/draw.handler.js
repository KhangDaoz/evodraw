import { markRoomActivity } from './room.activity.js';

export const registerDrawHandlers = (io, socket) => {
    // High-frequency event: Drawing a stroke
    // Expected payload: { roomId: string, stroke: object }
    // We broadcast this purely in memory (Live State)
    socket.on('draw_stroke', (payload) => {
        socket.to(payload.roomId).emit('draw_stroke_received', payload.stroke);
        markRoomActivity(payload?.roomId);
    });

    // High-frequency event: Moving mouse cursor
    // Expected payload: { roomId: string, position: { x, y }, username: string }
    socket.on('cursor_move', (payload) => {
        socket.to(payload.roomId).emit('cursor_moved', payload);
        markRoomActivity(payload?.roomId);
    });

};
