// The LWW compare rule exists in THREE places: the server (utils/lww.js) and both
// client serializers (web + desktop). The server can only be authoritative if all
// three resolve conflicts identically — if they drift, clients and server converge
// to different winners and the canvas silently diverges.
//
// This suite pins the behavior AND enforces that the three sources stay equivalent,
// which until now was guarded only by a comment.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { shouldAcceptRemote, getEvoId } from '../apps/server/src/utils/lww.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('shouldAcceptRemote', () => {
    test('accepts any remote when there is no local object', () => {
        assert.equal(shouldAcceptRemote(null, { _evoVersion: 0, _evoNonce: 500 }), true);
        assert.equal(shouldAcceptRemote(undefined, {}), true);
    });

    test('higher remote version wins', () => {
        assert.equal(
            shouldAcceptRemote({ _evoVersion: 1, _evoNonce: 1 }, { _evoVersion: 2, _evoNonce: 999 }),
            true,
        );
    });

    test('lower remote version loses', () => {
        assert.equal(
            shouldAcceptRemote({ _evoVersion: 5, _evoNonce: 999 }, { _evoVersion: 4, _evoNonce: 1 }),
            false,
        );
    });

    test('on a version tie the LOWER nonce wins', () => {
        assert.equal(
            shouldAcceptRemote({ _evoVersion: 3, _evoNonce: 500 }, { _evoVersion: 3, _evoNonce: 499 }),
            true,
        );
        assert.equal(
            shouldAcceptRemote({ _evoVersion: 3, _evoNonce: 500 }, { _evoVersion: 3, _evoNonce: 501 }),
            false,
        );
    });

    test('an exact tie (same version AND nonce) is rejected — keeps it deterministic', () => {
        assert.equal(
            shouldAcceptRemote({ _evoVersion: 3, _evoNonce: 500 }, { _evoVersion: 3, _evoNonce: 500 }),
            false,
        );
    });

    test('missing version is treated as 0', () => {
        assert.equal(shouldAcceptRemote({}, { _evoVersion: 1, _evoNonce: 5 }), true);
        assert.equal(shouldAcceptRemote({ _evoVersion: 1, _evoNonce: 5 }, {}), false);
    });

    test('missing nonce loses ties (treated as +Infinity)', () => {
        // Remote has no nonce → Infinity → cannot be lower than local's → rejected.
        assert.equal(shouldAcceptRemote({ _evoVersion: 2, _evoNonce: 10 }, { _evoVersion: 2 }), false);
        // Local has no nonce → Infinity → remote's finite nonce is lower → accepted.
        assert.equal(shouldAcceptRemote({ _evoVersion: 2 }, { _evoVersion: 2, _evoNonce: 10 }), true);
        // Neither has one: Infinity < Infinity is false → rejected.
        assert.equal(shouldAcceptRemote({ _evoVersion: 2 }, { _evoVersion: 2 }), false);
    });

    test('non-numeric version/nonce are coerced to the missing-value defaults', () => {
        assert.equal(shouldAcceptRemote({ _evoVersion: '9' }, { _evoVersion: 1, _evoNonce: 1 }), true);
    });

    test('the rule is antisymmetric — exactly one side of a conflict wins', () => {
        const cases = [
            [{ _evoVersion: 1, _evoNonce: 10 }, { _evoVersion: 2, _evoNonce: 10 }],
            [{ _evoVersion: 2, _evoNonce: 10 }, { _evoVersion: 2, _evoNonce: 11 }],
            [{ _evoVersion: 0, _evoNonce: 1 }, { _evoVersion: 0, _evoNonce: 2 }],
        ];
        for (const [a, b] of cases) {
            assert.notEqual(
                shouldAcceptRemote(a, b),
                shouldAcceptRemote(b, a),
                `both/neither won for ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
            );
        }
    });
});

describe('getEvoId', () => {
    test('returns the id only for a string _evoId', () => {
        assert.equal(getEvoId({ _evoId: 'abc' }), 'abc');
        assert.equal(getEvoId({ _evoId: 123 }), null);
        assert.equal(getEvoId({}), null);
        assert.equal(getEvoId(null), null);
    });
});

describe('cross-app parity', () => {
    // Extract the body of shouldAcceptRemote from a source file and normalize away
    // cosmetic differences (semicolons, indentation) so only real logic drift fails.
    const extract = (relPath) => {
        const src = readFileSync(join(ROOT, relPath), 'utf8');
        const start = src.indexOf('export function shouldAcceptRemote');
        assert.notEqual(start, -1, `shouldAcceptRemote not found in ${relPath}`);

        // Walk braces from the first '{' to find the matching close.
        const open = src.indexOf('{', start);
        let depth = 0;
        let end = -1;
        for (let i = open; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) { end = i + 1; break; }
            }
        }
        assert.notEqual(end, -1, `unbalanced braces in ${relPath}`);

        return src
            .slice(start, end)
            .replace(/;/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const SOURCES = {
        server: 'apps/server/src/utils/lww.js',
        web: 'apps/web/src/sync/canvasSerializer.js',
        desktop: 'apps/desktop/src/renderer/sync/canvasSerializer.js',
    };

    test('server, web and desktop implement an identical shouldAcceptRemote', () => {
        const server = extract(SOURCES.server);
        for (const app of ['web', 'desktop']) {
            assert.equal(
                extract(SOURCES[app]),
                server,
                `${app}'s shouldAcceptRemote has drifted from the server's (${SOURCES[app]} vs ` +
                `${SOURCES.server}). These MUST stay equivalent or clients and server pick ` +
                `different LWW winners and the canvas diverges.`,
            );
        }
    });
});
