// Per-room failed-join limiter, shared by the REST /join and socket join_room
// paths. Complements the per-IP limiters: an attacker rotating IPs against one
// room still gets at most MAX_FAILURES guesses per window. Counts only
// *failures*, so a busy legitimate room never locks itself out. In-memory and
// resets on restart, like the other transient server state.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_ENTRIES = 10_000;

const failures = new Map(); // normalized roomCode -> { count, resetAt }

function normalize(roomCode) {
    return String(roomCode || '').trim().toUpperCase();
}

function getLiveEntry(key) {
    const entry = failures.get(key);
    if (!entry) return null;
    if (Date.now() > entry.resetAt) {
        failures.delete(key);
        return null;
    }
    return entry;
}

export function isRoomLocked(roomCode) {
    const entry = getLiveEntry(normalize(roomCode));
    return !!entry && entry.count >= MAX_FAILURES;
}

export function recordFailure(roomCode) {
    const key = normalize(roomCode);
    if (!key) return;

    if (failures.size >= MAX_ENTRIES && !failures.has(key)) {
        const now = Date.now();
        for (const [k, v] of failures) {
            if (now > v.resetAt) failures.delete(k);
        }
        // Still full of live entries: drop the new key rather than grow unbounded.
        if (failures.size >= MAX_ENTRIES) return;
    }

    const entry = getLiveEntry(key);
    if (entry) {
        entry.count += 1;
    } else {
        failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    }
}

export function clearFailures(roomCode) {
    failures.delete(normalize(roomCode));
}
