// Tombstones are what stop a deleted object from being resurrected by a lagging
// client. Pruning them wrong means either unbounded storage growth or (worse)
// forgetting a delete too early and letting the object come back.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { pruneTombstones, TOMBSTONE_TTL_MS, MAX_TOMBSTONES } from '../apps/server/src/services/room.service.js';

describe('pruneTombstones', () => {
    const now = 1_700_000_000_000;

    test('keeps tombstones inside the TTL window', () => {
        const kept = pruneTombstones([{ id: 'a', deletedAt: now - 1000 }], now);
        assert.deepEqual(kept, [{ id: 'a', deletedAt: now - 1000 }]);
    });

    test('drops tombstones older than the TTL', () => {
        const stale = { id: 'old', deletedAt: now - TOMBSTONE_TTL_MS - 1 };
        const fresh = { id: 'new', deletedAt: now - 1 };
        const kept = pruneTombstones([stale, fresh], now);
        assert.deepEqual(kept.map((t) => t.id), ['new']);
    });

    test('drops a tombstone exactly at the cutoff (strictly-greater comparison)', () => {
        const kept = pruneTombstones([{ id: 'edge', deletedAt: now - TOMBSTONE_TTL_MS }], now);
        assert.deepEqual(kept, []);
    });

    test('filters malformed entries instead of persisting them', () => {
        const kept = pruneTombstones(
            [
                null,
                undefined,
                { id: 'no-date' },
                { deletedAt: now },
                { id: 42, deletedAt: now },
                { id: 'good', deletedAt: now },
            ],
            now,
        );
        assert.deepEqual(kept.map((t) => t.id), ['good']);
    });

    test('handles null/undefined input', () => {
        assert.deepEqual(pruneTombstones(undefined, now), []);
        assert.deepEqual(pruneTombstones(null, now), []);
    });

    test('caps at MAX_TOMBSTONES, keeping the MOST RECENT', () => {
        const tombstones = Array.from({ length: MAX_TOMBSTONES + 50 }, (_, i) => ({
            id: `id-${i}`,
            // Later index = more recent (all inside the TTL window).
            deletedAt: now - (MAX_TOMBSTONES + 50 - i),
        }));

        const kept = pruneTombstones(tombstones, now);

        assert.equal(kept.length, MAX_TOMBSTONES);
        // The newest entry survives; the oldest is evicted.
        const keptIds = new Set(kept.map((t) => t.id));
        assert.ok(keptIds.has(`id-${MAX_TOMBSTONES + 49}`), 'newest tombstone should be kept');
        assert.ok(!keptIds.has('id-0'), 'oldest tombstone should be evicted');
    });
});
