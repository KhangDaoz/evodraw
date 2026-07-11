import { markRoomActivity } from '../utils/roomActivity.js';
import { getRoom, updateRoomService } from '../services/room.service.js';
import { ensureAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';
import { applyOp, getSnapshot } from '../services/roomDocument.js';

// Payload bounds to prevent memory/bandwidth DoS and runaway document growth.
const MAX_SNAPSHOT_ELEMENTS = 100_000;
const MAX_OP_BYTES = 1_000_000; // ~1 MB serialized per single canvas op

// Authoritative-server sync (Backend Tier 1). Set AUTHORITATIVE_SYNC=false to fall
// back to the legacy pure-relay + client-snapshot behavior if a regression appears.
const AUTHORITATIVE = process.env.AUTHORITATIVE_SYNC !== 'false';

// ─── Handler Functions ────────────────────────────────────────────────────────

// draw event payload: { roomCode, stroke: { id, type, points, color, width, ... } }
function onDrawStroke(socket, payload) {
    const roomCode = readRoomCode(payload);
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    socket.to(roomCode).emit('draw_stroke_received', payload.stroke);
    markRoomActivity(roomCode);
}

// cursor move payload: { roomCode: string, position: { x, y }, username: string }
function onCursorMove(socket, payload) {
    const roomCode = readRoomCode(payload);
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    socket.to(roomCode).emit('cursor_moved', payload);
    markRoomActivity(roomCode);
}

// Canvas operation relay (object:added, object:modified, object:removed).
// Expected payload: { roomCode: string, op: { type, id?, object? } }
// Authoritative mode: the server applies LWW + tombstones and relays only the
// winning op; the loser gets the authoritative state back so it converges.
async function onCanvasOp(socket, payload) {
    const roomCode = readRoomCode(payload);
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    // Drop oversized ops rather than fanning them out to every peer.
    if (JSON.stringify(payload.op || null).length > MAX_OP_BYTES) {
        console.warn(`[CanvasOp] Dropped oversized op for room ${roomCode}`);
        return;
    }

    if (!AUTHORITATIVE) {
        // Legacy pure-relay behavior (kill-switch fallback).
        socket.to(roomCode).emit('canvas_op_received', { op: payload.op });
        markRoomActivity(roomCode);
        return;
    }

    try {
        const result = await applyOp(roomCode, payload.op);
        if (result.accepted && result.broadcastOp) {
            socket.to(roomCode).emit('canvas_op_received', { op: result.broadcastOp, seq: result.seq });
        } else if (result.correction && result.correction.object) {
            // Sender's edit lost LWW (or targeted a newer object) — send the
            // authoritative state back so the sender reconciles to it.
            socket.emit('canvas_op_received', { op: result.correction, seq: result.seq });
        }
        // Rejected with no correction (tombstoned / capped) → silently dropped.
    } catch (err) {
        console.error(`[CanvasOp] apply failed for room ${roomCode}:`, err.message);
        // Fail open: relay the raw op so an internal error doesn't lose the edit.
        socket.to(roomCode).emit('canvas_op_received', { op: payload.op });
    }

    markRoomActivity(roomCode);
}

// Canvas background color sync
// Expected payload: { roomCode: string, bgColor: string, bgId?: string }
function onCanvasBgChange(socket, payload) {
    const roomCode = readRoomCode(payload);
    if (!roomCode || !payload?.bgColor) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    const bgState = { bgColor: payload.bgColor, bgId: payload.bgId || 'default' };
    socket.to(roomCode).emit('canvas_bg_changed', bgState);
    markRoomActivity(roomCode);
}

// Client pushes a full canvas snapshot.
// DEPRECATED in authoritative mode: the server owns persistence (see roomDocument),
// so a client snapshot can no longer clobber state — it's treated as an activity
// ping only. Still registered for wire compatibility with unchanged clients.
// In kill-switch (legacy) mode it performs the old client-authoritative save.
async function onSaveSnapshot(socket, data) {
    const roomCode = readRoomCode(data);
    if (!roomCode) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }

    if (AUTHORITATIVE) {
        markRoomActivity(roomCode);
        return;
    }

    // Legacy client-authoritative persistence (kill-switch fallback).
    const { elements, sceneVersion } = data;
    if (!Array.isArray(elements) || typeof sceneVersion !== 'number') return;
    if (elements.length > MAX_SNAPSHOT_ELEMENTS) {
        console.warn(`[Snapshot] Rejected oversized snapshot (${elements.length} elements) for room ${roomCode}`);
        return;
    }
    try {
        await updateRoomService({ code: roomCode, roomVersion: sceneVersion, elements });
        markRoomActivity(roomCode);
    } catch (err) {
        console.error(`[Snapshot] Failed to save for room ${roomCode}:`, err.message);
    }
}

// Client requests the current snapshot of the room.
// Authoritative mode serves fresh in-memory state; legacy mode reads the DB.
async function onRequestSnapshot(io, socket, data) {
    const roomCode = readRoomCode(data);
    if (!roomCode) return;
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    try {
        if (AUTHORITATIVE) {
            const { elements, seq } = await getSnapshot(roomCode);
            socket.emit('snapshot_loaded', { elements, sceneVersion: seq });
        } else {
            const room = await getRoom({ code: roomCode, skipPasscodeCheck: true });
            if (room) {
                socket.emit('snapshot_loaded', {
                    elements: Array.isArray(room.elements) ? room.elements : [],
                    sceneVersion: typeof room.roomVersion === 'number' ? room.roomVersion : 0,
                });
            }
        }
    } catch (err) {
        console.error(`[Snapshot] Failed to load for room ${roomCode}:`, err.message);
    }
    // Still ask peers for live-only extras (screen-share rects, bg color) that
    // never enter the persistent document.
    socket.to(roomCode).emit('canvas_state_request', { requesterId: socket.id });
}

// Peer-to-peer state sync: new joiner asks existing peers for canvas snapshot
function onCanvasStateRequest(socket, data) {
    const roomCode = readRoomCode(data);
    try { ensureAuthorizedRoom(socket, roomCode); } catch (e) { return; }
    socket.to(roomCode).emit('canvas_state_request', { requesterId: socket.id });
}

// Existing peer responds with full canvas snapshot → forward to requester
function onCanvasStateResponse(io, socket, { requesterId, snapshot }) {
    const roomCode = socket.data.auth?.roomCode;
    if (!roomCode) return;
    // Forward only to a requester whose TOKEN authorizes the same room. We check
    // the token (set synchronously at connection) rather than room membership,
    // because joinRoom is async (awaits bcrypt) and the requester may not have
    // finished joining when this fast peer response arrives — checking membership
    // would drop the late joiner's state. This still blocks cross-room spoofing.
    const requester = io.sockets.sockets.get(requesterId);
    if (!requester || requester.data.auth?.roomCode !== roomCode) return;
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
