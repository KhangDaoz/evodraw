import { markRoomActivity } from '../utils/roomActivity.js';

// In-memory store for room background colors
const roomBgColors = new Map();

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

    // Canvas operation relay (object:added, object:modified, object:removed)
    // Expected payload: { roomId: string, op: { type, id?, object? } }
    socket.on('canvas_op', (payload) => {
        socket.to(payload.roomId).emit('canvas_op_received', { op: payload.op });
        markRoomActivity(payload?.roomId);
    });

    // Canvas background color sync
    // Expected payload: { roomId: string, bgColor: string, bgId?: string }
    socket.on('canvas_bg_change', (payload) => {
        if (!payload?.roomId || !payload?.bgColor) return;
        const bgState = { bgColor: payload.bgColor, bgId: payload.bgId || 'default' };
        roomBgColors.set(payload.roomId, bgState);
        socket.to(payload.roomId).emit('canvas_bg_changed', bgState);
        markRoomActivity(payload?.roomId);
    });

    // Initial state sync: new joiner asks existing peers for canvas snapshot
    socket.on('canvas_state_request', ({ roomId }) => {
        socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
    });

    // Existing peer responds with full canvas snapshot → forward to requester
    socket.on('canvas_state_response', ({ requesterId, snapshot }) => {
        io.to(requesterId).emit('canvas_state_init', { snapshot });
    });

};

