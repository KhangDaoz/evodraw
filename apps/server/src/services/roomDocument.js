import { shouldAcceptRemote, getEvoId } from '../utils/lww.js';
import { loadRoomDoc, persistRoomDoc, TOMBSTONE_TTL_MS } from './room.service.js';

// ─── Authoritative in-memory canvas document (Backend Tier 1) ────────────────
//
// One entry per active room. The server owns the canonical set of persistent
// elements and resolves every incoming op with the same LWW rule the clients use
// (utils/lww.js), so a lagging client can no longer resurrect a deleted object or
// clobber the room with a stale full-snapshot push.
//
// SINGLE-INSTANCE: this Map lives in one process. Horizontal scaling (Tier 2)
// must move room ownership into Redis or pin a room to one instance first.

const FLUSH_INTERVAL_MS = Number(process.env.ROOMDOC_FLUSH_INTERVAL_MS || 10_000);
const MAX_DOC_ELEMENTS = 100_000; // mirror MAX_SNAPSHOT_ELEMENTS bound

/** @typedef {{ elements: Map<string, object>, tombstones: Map<string, number>, seq: number, dirty: boolean, hydrating: Promise<void>|null, pendingEvict: boolean }} RoomDoc */

/** @type {Map<string, RoomDoc>} */
const rooms = new Map();

const normalize = (code) => String(code || '').trim().toUpperCase();

function pruneDocTombstones(doc, now = Date.now()) {
    const cutoff = now - TOMBSTONE_TTL_MS;
    for (const [id, deletedAt] of doc.tombstones) {
        if (deletedAt <= cutoff) doc.tombstones.delete(id);
    }
}

/**
 * Get (and lazily hydrate) the in-memory document for a room. Concurrent callers
 * during hydration share the same single-flight promise, so a burst of joins
 * can't produce two half-loaded docs.
 * @returns {Promise<RoomDoc>}
 */
export async function getRoomDoc(code) {
    const key = normalize(code);
    let doc = rooms.get(key);

    if (doc) {
        if (doc.hydrating) await doc.hydrating;
        // Someone rejoined a room whose eviction is still awaiting a successful
        // flush — it's live again, so cancel the pending drop.
        doc.pendingEvict = false;
        pruneDocTombstones(doc);
        return doc;
    }

    doc = { elements: new Map(), tombstones: new Map(), seq: 0, dirty: false, hydrating: null, pendingEvict: false };
    rooms.set(key, doc);

    // Assigned synchronously (the async IIFE only yields at its first await, which
    // is inside loadRoomDoc), so a concurrent caller always sees `hydrating` set.
    doc.hydrating = (async () => {
        try {
            const loaded = await loadRoomDoc(key);
            if (loaded) {
                for (const el of loaded.elements) {
                    const id = getEvoId(el);
                    if (id) doc.elements.set(id, el);
                }
                for (const t of loaded.tombstones) {
                    if (t && typeof t.id === 'string' && typeof t.deletedAt === 'number') {
                        doc.tombstones.set(t.id, t.deletedAt);
                    }
                }
            }
        } catch (err) {
            // Drop the half-hydrated doc so the next access retries. Keeping it
            // would serve joiners an empty board — and the first op would mark it
            // dirty, letting a later flush overwrite the persisted elements.
            rooms.delete(key);
            console.error(`[RoomDoc] Hydration failed for ${key}:`, err.message);
            throw err;
        } finally {
            doc.hydrating = null;
        }
    })();

    await doc.hydrating;
    pruneDocTombstones(doc);
    return doc;
}

/**
 * Apply one canvas op to the authoritative document.
 * @returns {Promise<{ accepted: boolean, seq: number, broadcastOp?: object, correction?: object }>}
 *   - accepted + broadcastOp: relay this op (the winner) to the other peers.
 *   - correction: the op lost LWW; send this authoritative state back to the sender.
 */
export async function applyOp(code, op) {
    if (!op || typeof op.type !== 'string') return { accepted: false, seq: 0 };
    const doc = await getRoomDoc(code);
    const now = Date.now();

    switch (op.type) {
        case 'object:added':
        case 'object:modified': {
            const obj = op.object;
            if (!obj) return { accepted: false, seq: doc.seq };

            // Screen-share rects are ephemeral (never persisted): relay only.
            if (obj._evoScreenShare) {
                doc.seq += 1;
                return { accepted: true, seq: doc.seq, broadcastOp: op };
            }

            const id = getEvoId(obj) || (typeof op.id === 'string' ? op.id : null);
            if (!id) return { accepted: false, seq: doc.seq };

            // Dead object — refuse resurrection.
            if (doc.tombstones.has(id)) return { accepted: false, seq: doc.seq };

            const existing = doc.elements.get(id) || null;

            // Bound total live elements to prevent memory-exhaustion via new ids.
            if (!existing && doc.elements.size >= MAX_DOC_ELEMENTS) {
                console.warn(`[RoomDoc] Element cap reached for ${normalize(code)} — dropping new object`);
                return { accepted: false, seq: doc.seq };
            }

            if (shouldAcceptRemote(existing, obj)) {
                doc.elements.set(id, obj);
                doc.dirty = true;
                doc.seq += 1;
                return { accepted: true, seq: doc.seq, broadcastOp: op };
            }

            // Loser: hand the sender the authoritative state so it converges.
            return {
                accepted: false,
                seq: doc.seq,
                correction: { type: 'object:modified', id, object: existing },
            };
        }

        case 'object:removed': {
            const id = typeof op.id === 'string' ? op.id : getEvoId(op.object);
            if (!id) return { accepted: false, seq: doc.seq };

            doc.tombstones.set(id, now);
            doc.elements.delete(id);
            // Always persist the tombstone — a remove can race ahead of its add
            // (or target an element another instance holds), and an unpersisted
            // tombstone would let the object resurrect after a restart.
            doc.dirty = true;
            doc.seq += 1;
            return { accepted: true, seq: doc.seq, broadcastOp: { type: 'object:removed', id } };
        }

        default:
            return { accepted: false, seq: doc.seq };
    }
}

/** Full authoritative state for a late joiner / resync. */
export async function getSnapshot(code) {
    const doc = await getRoomDoc(code);
    return { elements: Array.from(doc.elements.values()), seq: doc.seq };
}

/**
 * Persist a room's document if it has unsaved changes.
 * @returns {Promise<boolean>} true when the doc is safely persisted (or there was
 *   nothing to save, or the room is gone); false when the write failed and the
 *   doc still holds unsaved edits that must NOT be discarded.
 */
export async function flushRoom(code) {
    const key = normalize(code);
    const doc = rooms.get(key);
    if (!doc || !doc.dirty) return true;
    if (doc.hydrating) await doc.hydrating;

    const elements = Array.from(doc.elements.values());
    const tombstones = Array.from(doc.tombstones, ([id, deletedAt]) => ({ id, deletedAt }));

    try {
        await persistRoomDoc({ code: key, elements, tombstones });
        doc.dirty = false;
        return true;
    } catch (err) {
        if (err.statusCode === 404) {
            // Room was TTL-deleted from the DB — drop the orphaned in-memory doc.
            rooms.delete(key);
            return true;
        }
        console.error(`[RoomDoc] Flush failed for ${key}:`, err.message);
        return false;
    }
}

/**
 * Flush then drop a room from memory (call when the room empties).
 *
 * If the flush fails (transient DB error), the doc is KEPT and marked for eviction
 * instead: dropping it here would silently lose every edit made since the last
 * successful flush. The periodic loop retries and drops it once it's clean.
 */
export async function evictRoom(code) {
    const key = normalize(code);
    const doc = rooms.get(key);
    if (!doc) return;

    const flushed = await flushRoom(key);
    if (!flushed) {
        doc.pendingEvict = true;
        console.warn(`[RoomDoc] Eviction of ${key} deferred — unsaved edits, will retry on next flush.`);
        return;
    }
    rooms.delete(key);
}

/** Flush every dirty room (periodic tick + graceful shutdown). */
export async function flushAllDirty() {
    const keys = Array.from(rooms.keys());
    await Promise.allSettled(keys.map((k) => flushRoom(k)));
}

let flushTimer = null;

/** Start the periodic flush + tombstone-sweep loop. Idempotent. */
export function startRoomDocLoop() {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
        flushAllDirty()
            .then(() => {
                // Complete any eviction that was deferred by a failed flush: the room
                // is empty and its edits are now safely persisted, so it can go.
                for (const [key, doc] of rooms) {
                    if (doc.pendingEvict && !doc.dirty && !doc.hydrating) rooms.delete(key);
                }
            })
            .catch((e) => console.error('[RoomDoc] periodic flush error:', e.message));
        const now = Date.now();
        for (const doc of rooms.values()) pruneDocTombstones(doc, now);
    }, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function stopRoomDocLoop() {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
}
