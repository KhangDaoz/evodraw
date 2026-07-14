// Resolve the real client IP for a Socket.IO connection.
//
// Behind a reverse proxy (Render, nginx) every socket's `handshake.address` is the
// proxy's address, so an IP-keyed limiter would collapse all users into one bucket.
// Express solves this with `trust proxy`; Socket.IO has no equivalent, so we mirror
// the same rule here.
//
// Only consulted when TRUST_PROXY is on: X-Forwarded-For is client-supplied and
// trivially spoofable when there is no proxy in front to overwrite it.

export const TRUST_PROXY =
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_PROXY === 'true' ||
    (process.env.TRUST_PROXY === undefined && process.env.NODE_ENV === 'production');

export function getSocketClientIp(socket) {
    if (TRUST_PROXY) {
        const forwarded = socket.handshake.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length > 0) {
            // Take the LAST entry: it's the one stamped by the nearest (trusted) hop,
            // matching Express's `trust proxy: 1` semantics. Earlier entries are
            // attacker-controlled and must not be trusted.
            const parts = forwarded.split(',');
            const nearest = parts[parts.length - 1].trim();
            if (nearest) return nearest;
        }
    }
    return socket.handshake.address;
}
