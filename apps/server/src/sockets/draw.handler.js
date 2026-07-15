import { markRoomActivity } from '../utils/roomActivity.js';
import { getRoom, updateRoomService } from '../services/room.service.js';
import { isAuthorizedRoom, readRoomCode } from '../utils/roomAuth.js';
import { applyOp, getSnapshot } from '../services/roomDocument.js';
import { allowEvent } from '../utils/eventRateLimiter.js';
import { AUTHORITATIVE } from '../config/env.js';

// Payload bounds to prevent memory/bandwidth DoS and runaway document growth.
const MAX_SNAPSHOT_ELEMENTS = 100_000;
const MAX_OP_BYTES = 1_000_000; // ~1 MB serialized per single canvas op
const MAX_SNAPSHOT_BYTES = 10_000_000; // ~10 MB serialized for a full peer snapshot

// ─── Handler Functions ────────────────────────────────────────────────────────

// Bounds for live in-progress stroke previews (small, high-frequency payloads).
const MAX_STROKE_ID_LENGTH = 64;
const MAX_STROKE_POINTS_PER_BATCH = 256;
const MAX_STROKE_BYTES = 32_768;
// A legit client has ~1 stroke in flight; the cap only stops a client that
// streams unique ids without ever sending stroke_end from growing the set.
const MAX_ACTIVE_STROKES = 100;

// Live in-progress stroke preview relay (ephemeral — never persisted).
// Expected payload: { roomCode, stroke: { id, points: [[x,y],...], style } }
function onStrokeProgress(socket, payload) {
    const roomCode = readRoomCode(payload);
    if (!isAuthorizedRoom(socket, roomCode)) return;

    const stroke = payload?.stroke;
    if (
        !stroke ||
        typeof stroke.id !== 'string' ||
        stroke.id.length === 0 ||
        stroke.id.length > MAX_STROKE_ID_LENGTH ||
        !Array.isArray(stroke.points) ||
        stroke.points.length > MAX_STROKE_POINTS_PER_BATCH ||
        JSON.stringify(stroke).length > MAX_STROKE_BYTES
    ) return;

    // Client batches at 40 ms (~25/sec); anything past this is a flood.
    if (!allowEvent(socket, 'stroke_progress', { capacity: 60, refillPerSec: 30 })) return;

    // Track active strokes so previews can be cleaned up if the drawer
    // disconnects mid-stroke (see the 'disconnecting' handler below).
    const activeStrokes = (socket.data.activeStrokes ??= new Set());
    if (activeStrokes.size >= MAX_ACTIVE_STROKES && !activeStrokes.has(stroke.id)) return;
    activeStrokes.add(stroke.id);
    socket.to(roomCode).emit('stroke_progress_received', { stroke });
    markRoomActivity(roomCode);
}

// Expected payload: { roomCode, strokeId }
function onStrokeEnd(socket, payload) {
    const roomCode = readRoomCode(payload);
    if (!isAuthorizedRoom(socket, roomCode)) return;
    const strokeId = payload?.strokeId;
    if (typeof strokeId !== 'string' || strokeId.length > MAX_STROKE_ID_LENGTH) return;
    socket.data.activeStrokes?.delete(strokeId);
    socket.to(roomCode).emit('stroke_end_received', { strokeId });
    markRoomActivity(roomCode);
}

// cursor move payload: { roomCode: string, position: { x, y }, username: string }
function onCursorMove(socket, payload) {
    const roomCode = readRoomCode(payload);
    if (!isAuthorizedRoom(socket, roomCode)) return;

    // Whitelist the relayed fields — this was the last relay that fanned out an
    // arbitrary, unbounded client payload to every peer.
    const position = payload?.position;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return;
    const username = typeof payload?.username === 'string' ? payload.username.slice(0, 64) : undefined;

    // Client throttles to 80 ms (~12.5/sec); anything past this is a flood.
    if (!allowEvent(socket, 'cursor_move', { capacity: 60, refillPerSec: 30 })) return;

    socket.to(roomCode).emit('cursor_moved', { position: { x: position.x, y: position.y }, username });
    markRoomActivity(roomCode);
}

// Canvas operation relay (object:added, object:modified, object:removed).
// Expected payload: { roomCode: string, op: { type, id?, object? } }
// Authoritative mode: the server applies LWW + tombstones and relays only the
// winning op; the loser gets the authoritative state back so it converges.
async function onCanvasOp(socket, payload) {
    const roomCode = readRoomCode(payload);
    if (!isAuthorizedRoom(socket, roomCode)) return;

    // Drop oversized ops rather than fanning them out to every peer.
    if (JSON.stringify(payload.op || null).length > MAX_OP_BYTES) {
        console.warn(`[CanvasOp] Dropped oversized op for room ${roomCode}`);
        return;
    }

    // Generous bound (multi-delete/eraser bursts are legit); stops tight-loop floods.
    if (!allowEvent(socket, 'canvas_op', { capacity: 300, refillPerSec: 100 })) return;

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
        } else if (result.correction) {
            // Sender's edit lost LWW or targeted a tombstoned object — send the
            // authoritative state (or removal) back so the sender reconciles to it.
            socket.emit('canvas_op_received', { op: result.correction, seq: result.seq });
        } else if (result.reason === 'capacity') {
            // The board hit its element/byte cap. Silently dropping would leave the
            // user drawing into the void, so say so. Deliberately NOT `room_error`:
            // that one means "access denied" to the client and ejects it from the room.
            socket.emit('canvas_error', { message: 'Board is full — delete something before adding more.' });
        }
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
    // A CSS color / preset id is short; anything longer is a fan-out abuse vector.
    const bgColor = payload?.bgColor;
    if (!roomCode || typeof bgColor !== 'string' || bgColor.length === 0 || bgColor.length > 64) return;
    const bgId = typeof payload?.bgId === 'string' && payload.bgId.length <= 64 ? payload.bgId : 'default';
    if (!isAuthorizedRoom(socket, roomCode)) return;
    if (!allowEvent(socket, 'canvas_bg_change', { capacity: 5, refillPerSec: 0.5 })) return;
    socket.to(roomCode).emit('canvas_bg_changed', { bgColor, bgId });
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
    if (!isAuthorizedRoom(socket, roomCode)) return;

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
        await updateRoomService({ code: roomCode, elements });
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
    if (!isAuthorizedRoom(socket, roomCode)) return;
    try {
        if (AUTHORITATIVE) {
            const { elements, tombstones, seq } = await getSnapshot(roomCode);
            // `authoritative: true` tells clients the server owns persistence, so
            // they can skip their (ignored) periodic save_snapshot pushes.
            socket.emit('snapshot_loaded', { elements, tombstones, sceneVersion: seq, authoritative: true });
        } else {
            const room = await getRoom({ code: roomCode, skipPasscodeCheck: true });
            if (room) {
                socket.emit('snapshot_loaded', {
                    elements: Array.isArray(room.elements) ? room.elements : [],
                    sceneVersion: typeof room.roomVersion === 'number' ? room.roomVersion : 0,
                    authoritative: false,
                });
            }
        }
    } catch (err) {
        console.error(`[Snapshot] Failed to load for room ${roomCode}:`, err.message);
    }
    // Peers are asked for live-only extras (screen-share rects, bg color) by the
    // client's own canvas_state_request emit; no need to broadcast a second one here.
}

// Peer-to-peer state sync: new joiner asks existing peers for canvas snapshot
function onCanvasStateRequest(socket, data) {
    const roomCode = readRoomCode(data);
    if (!isAuthorizedRoom(socket, roomCode)) return;
    socket.to(roomCode).emit('canvas_state_request', { requesterId: socket.id });
}

// Existing peer responds with full canvas snapshot → forward to requester
function onCanvasStateResponse(io, socket, { requesterId, snapshot }) {
    const roomCode = socket.data.auth?.roomCode;
    if (!roomCode) return;

    // Bound the relayed snapshot: unlike canvas_op (guarded by MAX_OP_BYTES), this
    // peer-supplied payload was previously forwarded unchecked, letting a room member
    // exhaust a requester's memory/bandwidth with an oversized snapshot.
    const objects = snapshot?.objects;
    if (!Array.isArray(objects) || objects.length > MAX_SNAPSHOT_ELEMENTS) {
        console.warn(`[CanvasState] Dropped invalid/oversized snapshot for room ${roomCode}`);
        return;
    }
    if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) {
        console.warn(`[CanvasState] Dropped oversized snapshot (>${MAX_SNAPSHOT_BYTES} bytes) for room ${roomCode}`);
        return;
    }

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
    socket.on('stroke_progress',       (payload) => onStrokeProgress(socket, payload));
    socket.on('stroke_end',            (payload) => onStrokeEnd(socket, payload));
    socket.on('cursor_move',           (payload) => onCursorMove(socket, payload));
    socket.on('canvas_op',             (payload) => onCanvasOp(socket, payload));
    socket.on('canvas_bg_change',      (payload) => onCanvasBgChange(socket, payload));
    socket.on('save_snapshot',         (data)    => onSaveSnapshot(socket, data));
    socket.on('request_snapshot',      (data)    => onRequestSnapshot(io, socket, data));
    socket.on('canvas_state_request',  (data)    => onCanvasStateRequest(socket, data));
    socket.on('canvas_state_response', (data)    => onCanvasStateResponse(io, socket, data));

    // End any in-progress stroke previews when the drawer's socket dies
    // mid-stroke, so peers don't keep stale preview polylines around.
    socket.on('disconnecting', () => {
        const roomCode = socket.data.auth?.roomCode;
        if (!roomCode || !socket.data.activeStrokes?.size) return;
        for (const strokeId of socket.data.activeStrokes) {
            socket.to(roomCode).emit('stroke_end_received', { strokeId });
        }
        socket.data.activeStrokes.clear();
    });
};
