// Per-socket token-bucket rate limiter for relay events.
//
// Size caps alone don't stop an authorized member from flooding a room with
// max-size payloads in a tight loop; this bounds the *rate* per socket per
// event. Buckets live on socket.data, so they die with the socket — no global
// state to prune. Limits are deliberately generous: the goal is stopping
// floods, not shaping normal use.

/**
 * Returns true when the socket may emit this event now, consuming one token.
 * @param {import('socket.io').Socket} socket
 * @param {string} name - event name (one bucket per name)
 * @param {{ capacity: number, refillPerSec: number }} opts
 *   capacity: burst size; refillPerSec: sustained events per second.
 */
export function allowEvent(socket, name, { capacity, refillPerSec }) {
    const buckets = (socket.data.rateBuckets ??= new Map());
    const now = Date.now();
    let bucket = buckets.get(name);
    if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        buckets.set(name, bucket);
    } else {
        const elapsedSec = (now - bucket.lastRefill) / 1000;
        if (elapsedSec > 0) {
            bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
            bucket.lastRefill = now;
        }
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
}
