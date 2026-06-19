import { markRoomActivity } from '../utils/roomActivity.js';
import { getRoom, updateRoomService } from '../services/room.service.js';
import { ensureAuthorizedRoom } from '../utils/guard.js';

// Payload bounds to prevent memory/bandwidth DoS and runaway document growth.
const MAX_SNAPSHOT_ELEMENTS = 100_000;
const MAX_OP_BYTES = 1_000_000; // ~1 MB serialized per single canvas op

// ─── Handler Functions ────────────────────────────────────────────────────────

// draw event payload: { roomId, stroke: { id, type, points, color, width, ... } }
function onDrawStroke(socket, payload) {
    try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
    socket.to(payload.roomId).emit('draw_stroke_received', payload.stroke);
    markRoomActivity(payload?.roomId);
}

// cursor move payload: { roomId: string, position: { x, y }, username: string }
function onCursorMove(socket, payload) {
    try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
    socket.to(payload.roomId).emit('cursor_moved', payload);
    markRoomActivity(payload?.roomId);
}

// Canvas operation relay (object:added, object:modified, object:removed)
// Expected payload: { roomId: string, op: { type, id?, object? } }
function onCanvasOp(socket, payload) {
    try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
    // Drop oversized ops rather than fanning them out to every peer.
    if (JSON.stringify(payload.op || null).length > MAX_OP_BYTES) {
        console.warn(`[CanvasOp] Dropped oversized op for room ${payload.roomId}`);
        return;
    }
    socket.to(payload.roomId).emit('canvas_op_received', { op: payload.op });
    markRoomActivity(payload?.roomId);
}

// Canvas background color sync
// Expected payload: { roomId: string, bgColor: string, bgId?: string }
function onCanvasBgChange(socket, payload) {
    if (!payload?.roomId || !payload?.bgColor) return;
    try { ensureAuthorizedRoom(socket, payload.roomId); } catch (e) { return; }
    const bgState = { bgColor: payload.bgColor, bgId: payload.bgId || 'default' };
    socket.to(payload.roomId).emit('canvas_bg_changed', bgState);
    markRoomActivity(payload?.roomId);
}

// Client pushes a full canvas snapshot for server-side persistence
async function onSaveSnapshot(socket, { roomId, elements, sceneVersion }) {
    if (!roomId || !Array.isArray(elements) || typeof sceneVersion !== 'number') return;
    if (elements.length > MAX_SNAPSHOT_ELEMENTS) {
        console.warn(`[Snapshot] Rejected oversized snapshot (${elements.length} elements) for room ${roomId}`);
        return;
    }
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
}

// Client requests current snapshot of room from server DB
async function onRequestSnapshot(io, socket, { roomId }) {
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
}

// Peer-to-peer state sync: new joiner asks existing peers for canvas snapshot
function onCanvasStateRequest(socket, { roomId }) {
    try { ensureAuthorizedRoom(socket, roomId); } catch (e) { return; }
    socket.to(roomId).emit('canvas_state_request', { requesterId: socket.id });
}

// Existing peer responds with full canvas snapshot → forward to requester
function onCanvasStateResponse(io, socket, { requesterId, snapshot }) {
    const roomId = socket.data.auth?.roomId;
    if (!roomId) return;
    // Forward only to a requester whose TOKEN authorizes the same room. We check
    // the token (set synchronously at connection) rather than room membership,
    // because joinRoom is async (awaits bcrypt) and the requester may not have
    // finished joining when this fast peer response arrives — checking membership
    // would drop the late joiner's state. This still blocks cross-room spoofing.
    const requester = io.sockets.sockets.get(requesterId);
    if (!requester || requester.data.auth?.roomId !== roomId) return;
    io.to(requesterId).emit('canvas_state_init', { snapshot });
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export const registerDrawHandlers = (io, socket) => {
    socket.on('draw_stroke',           (payload) => onDrawStroke(socket, payload));
    socket.on('cursor_move',           (payload) => onCursorMove(socket, payload));
    socket.on('canvas_op',             (payload) => onCanvasOp(socket, payload));
    socket.on('canvas_bg_change',      (payload) => onCanvasBgChange(socket, payload));
    socket.on('save_snapshot',         (data)    => onSaveSnapshot(socket, data));
    socket.on('request_snapshot',      (data)    => onRequestSnapshot(io, socket, data));
    socket.on('canvas_state_request',  (data)    => onCanvasStateRequest(socket, data));
    socket.on('canvas_state_response', (data)    => onCanvasStateResponse(io, socket, data));
};
