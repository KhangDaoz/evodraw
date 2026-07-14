// Per-socket token buckets bound the RATE of relay events. Size caps alone don't
// stop an authorized member from flooding a room with max-size payloads in a loop.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { allowEvent } from '../apps/server/src/utils/eventRateLimiter.js';

// Minimal stand-in for a Socket.IO socket: the limiter only touches socket.data.
const fakeSocket = () => ({ data: {} });

describe('allowEvent', () => {
    let socket;
    beforeEach(() => { socket = fakeSocket(); });

    test('allows a full burst up to capacity, then blocks', () => {
        const opts = { capacity: 5, refillPerSec: 1 };
        for (let i = 0; i < 5; i++) {
            assert.equal(allowEvent(socket, 'e', opts), true, `burst event ${i} should pass`);
        }
        assert.equal(allowEvent(socket, 'e', opts), false, 'the 6th event should be blocked');
    });

    test('refills over time', async () => {
        // capacity 1, 100/sec → a token is back within ~10ms.
        const opts = { capacity: 1, refillPerSec: 100 };
        assert.equal(allowEvent(socket, 'e', opts), true);
        assert.equal(allowEvent(socket, 'e', opts), false, 'bucket is drained');

        await new Promise((r) => setTimeout(r, 60));
        assert.equal(allowEvent(socket, 'e', opts), true, 'should refill after waiting');
    });

    test('refill never exceeds capacity', async () => {
        const opts = { capacity: 2, refillPerSec: 1000 };
        allowEvent(socket, 'e', opts);
        await new Promise((r) => setTimeout(r, 50)); // would refill ~50 tokens, uncapped

        assert.equal(allowEvent(socket, 'e', opts), true);
        assert.equal(allowEvent(socket, 'e', opts), true);
        assert.equal(allowEvent(socket, 'e', opts), false, 'must not bank more than capacity');
    });

    test('each event name gets its own bucket', () => {
        const opts = { capacity: 1, refillPerSec: 0 };
        assert.equal(allowEvent(socket, 'chat', opts), true);
        assert.equal(allowEvent(socket, 'chat', opts), false, 'chat is drained');
        assert.equal(allowEvent(socket, 'cursor', opts), true, 'cursor has its own budget');
    });

    test('each socket gets its own buckets', () => {
        const opts = { capacity: 1, refillPerSec: 0 };
        const other = fakeSocket();
        assert.equal(allowEvent(socket, 'e', opts), true);
        assert.equal(allowEvent(socket, 'e', opts), false);
        assert.equal(allowEvent(other, 'e', opts), true, 'one socket must not drain another');
    });

    test('buckets live on socket.data so they die with the socket', () => {
        allowEvent(socket, 'e', { capacity: 1, refillPerSec: 1 });
        assert.ok(socket.data.rateBuckets instanceof Map);
    });
});
