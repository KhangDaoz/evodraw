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

    // ── Snapshot persistence (blind store) ──

    // Client pushes a full canvas snapshot for server-side persistence
    // Expected payload: { roomId: string, elements: Array, sceneVersion: number }
    socket.on('save_snapshot', async ({ roomId, elements, sceneVersion }) => {
        if (!roomId || !Array.isArray(elements) || typeof sceneVersion !== 'number') return;
        try {
            await Room.saveSnapshot(roomId, elements, sceneVersion);
            markRoomActivity(roomId);
        } catch (err) {
            console.error(`[Snapshot] Failed to save for room ${roomId}:`, err.message);
        }
    });

    // Late joiner requests stored snapshot from server
    // Server responds with MongoDB data first, also asks peers as fallback
    socket.on('request_snapshot', async ({ roomId }) => {
        if (!roomId) return;
        try {
            const snapshot = await Room.getSnapshot(roomId);
            if (snapshot) {
                socket.emit('snapshot_loaded', snapshot);
            }
        } catch (err) {
            console.error(`[Snapshot] Failed to load for room ${roomId}:`, err.message);
        }
        // Also ask peers as fallback (existing behavior)
        socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
    });

    // Peer-to-peer state sync: new joiner asks existing peers for canvas snapshot
    socket.on('canvas_state_request', ({ roomId }) => {
        socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
    });

    // Existing peer responds with full canvas snapshot → forward to requester
    socket.on('canvas_state_response', ({ requesterId, snapshot }) => {
        io.to(requesterId).emit('canvas_state_init', { snapshot });
    });

};

