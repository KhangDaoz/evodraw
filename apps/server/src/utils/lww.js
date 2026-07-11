// Server-side Last-Write-Wins comparison.
//
// This MUST stay byte-for-byte equivalent to the client's `shouldAcceptRemote`
// in apps/web/src/sync/canvasSerializer.js — the server can only be authoritative
// without breaking clients if it resolves conflicts by the exact same rule the
// clients already use. If the two ever drift, clients and server converge to
// different winners and the canvas diverges.
//
// Rule: higher `_evoVersion` wins; on a tie, the lower `_evoNonce` wins
// (deterministic). Missing version → treated as 0; missing nonce → treated as
// +Infinity (loses ties).
//
// NOTE: the "frontend Tier 1" step replaces the random nonce with a Hybrid
// Logical Clock. When that lands, promote this function into a shared package so
// client and server import one definition instead of mirroring it.

export function shouldAcceptRemote(local, remote) {
    if (!local) return true;
    const localV = typeof local._evoVersion === 'number' ? local._evoVersion : 0;
    const remoteV = typeof remote._evoVersion === 'number' ? remote._evoVersion : 0;
    if (remoteV > localV) return true;
    if (remoteV === localV) {
        const localN = typeof local._evoNonce === 'number' ? local._evoNonce : Infinity;
        const remoteN = typeof remote._evoNonce === 'number' ? remote._evoNonce : Infinity;
        return remoteN < localN;
    }
    return false;
}

// Stable per-object identity used as the document key.
export function getEvoId(obj) {
    return obj && typeof obj._evoId === 'string' ? obj._evoId : null;
}
