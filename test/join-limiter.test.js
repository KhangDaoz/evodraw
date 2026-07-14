// The per-room failure budget is the last line of defense against passcode
// brute-force by an attacker who rotates IPs. It must lock after MAX_FAILURES,
// clear on a successful join, and never grow without bound.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { isRoomLocked, recordFailure, clearFailures } from '../apps/server/src/utils/joinLimiter.js';

// The limiter's Map is module-level state shared across tests, so every test uses
// a unique room code rather than trying to reset it.
let seq = 0;
const freshRoom = () => `RM${String(seq++).padStart(4, '0')}`;

describe('joinLimiter', () => {
    let room;
    beforeEach(() => { room = freshRoom(); });

    test('a fresh room is not locked', () => {
        assert.equal(isRoomLocked(room), false);
    });

    test('stays unlocked below the failure threshold, locks at it', () => {
        // MAX_FAILURES is 10 (private to the module); 9 failures must not lock.
        for (let i = 0; i < 9; i++) recordFailure(room);
        assert.equal(isRoomLocked(room), false, 'should still be open after 9 failures');

        recordFailure(room);
        assert.equal(isRoomLocked(room), true, 'should lock on the 10th failure');
    });

    test('further failures keep it locked', () => {
        for (let i = 0; i < 15; i++) recordFailure(room);
        assert.equal(isRoomLocked(room), true);
    });

    test('a successful join clears the budget', () => {
        for (let i = 0; i < 10; i++) recordFailure(room);
        assert.equal(isRoomLocked(room), true);

        clearFailures(room);
        assert.equal(isRoomLocked(room), false);
    });

    test('room codes are normalized (case/whitespace insensitive)', () => {
        // The REST path and the socket path must hit the SAME bucket, or an attacker
        // could double their guesses by varying the case of the code.
        for (let i = 0; i < 10; i++) recordFailure(room.toLowerCase());
        assert.equal(isRoomLocked(`  ${room.toUpperCase()}  `), true);

        clearFailures(`  ${room.toLowerCase()}  `);
        assert.equal(isRoomLocked(room), false);
    });

    test('an empty room code is ignored rather than recorded', () => {
        recordFailure('');
        recordFailure(null);
        recordFailure(undefined);
        assert.equal(isRoomLocked(''), false);
    });

    test('failures are tracked per room, not globally', () => {
        const other = freshRoom();
        for (let i = 0; i < 10; i++) recordFailure(room);
        assert.equal(isRoomLocked(room), true);
        assert.equal(isRoomLocked(other), false, 'locking one room must not lock another');
    });
});
