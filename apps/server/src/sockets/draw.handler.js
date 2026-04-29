import { markRoomActivity } from '../utils/roomActivity.js';
import { getRoom, updateRoomService } from '../services/room.service.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

export const registerDrawHandlers = (io, socket) => {
    // draw event payload {roomId, stroke: { id, type, points, color, width, ... }}
    socket.on('draw_stroke', (payload) => {
        try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
        socket.to(payload.roomId).emit('draw_stroke_received', payload.stroke);
        markRoomActivity(payload?.roomId);
    });

    // cursor move payload { roomId: string, position: { x, y }, username: string }
    socket.on('cursor_move', (payload) => {
        try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
        socket.to(payload.roomId).emit('cursor_moved', payload);
        markRoomActivity(payload?.roomId);
    });

    // Canvas operation relay (object:added, object:modified, object:removed)
    // Expected payload: { roomId: string, op: { type, id?, object? } }
    socket.on('canvas_op', (payload) => {
        try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
        socket.to(payload.roomId).emit('canvas_op_received', { op: payload.op });
        markRoomActivity(payload?.roomId);
    });

    // Canvas background color sync
    // Expected payload: { roomId: string, bgColor: string, bgId?: string }
    socket.on('canvas_bg_change', (payload) => {
        if (!payload?.roomId || !payload?.bgColor) return;
        try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
        const bgState = { bgColor: payload.bgColor, bgId: payload.bgId || 'default' };
        socket.to(payload.roomId).emit('canvas_bg_changed', bgState);
        markRoomActivity(payload?.roomId);
    });

    // client pushes a full canvas snapshot for server-side persistence
    socket.on('save_snapshot', async ({ roomId, elements, sceneVersion }) => {
        if (!roomId || !Array.isArray(elements) || typeof sceneVersion !== 'number') return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
        try {
            await updateRoomService({
                code: roomId,
                roomVersion: sceneVersion,
                elements,
            });
            markRoomActivity(roomId);
        } catch (err) {
            console.error(`[Snapshot] Failed to save for room ${roomId}:`, err.message);
        }
    });

    // client request current snapshot of room
    socket.on('request_snapshot', async ({ roomId }) => {
        if (!roomId) return;
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
        try {
            const room = await getRoom({ code: roomId, skipPasscodeCheck: true });
            if (room) {
                socket.emit('snapshot_loaded', {
                    elements: Array.isArray(room.elements) ? room.elements : [],
                    sceneVersion: typeof room.roomVersion === 'number' ? room.roomVersion : 0,
                });
            }
        } catch (err) {
            console.error(`[Snapshot] Failed to load for room ${roomId}:`, err.message);
        }
        socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
    });

    // Peer-to-peer state sync: new joiner asks existing peers for canvas snapshot
    socket.on('canvas_state_request', ({ roomId }) => {
        try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
        socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
    });

    // Existing peer responds with full canvas snapshot → forward to requester
    socket.on('canvas_state_response', ({ requesterId, snapshot }) => {
        // Here we just use the current socket's authorized room to prevent spoofing
        const roomId = socket.data.auth?.roomId;
        if (!roomId) return;
        io.to(requesterId).emit('canvas_state_init', { snapshot });
    });

};

