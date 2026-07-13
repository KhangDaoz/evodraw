import Room from '../models/Room.js';
import bcrypt from 'bcrypt';
import { generateRoomCode, generateRoomPasscode } from '../utils/codeGenerator.js';

export async function createRoomService() {
	let code = generateRoomCode();
	let isUnique = false;
	let attempts = 0;

	while (!isUnique && attempts < 5) {
		const existingRoom = await Room.findOne({ code });
		if (!existingRoom) {
			isUnique = true;
		} else {
			code = generateRoomCode();
			attempts++;
		}
	}

	if (!isUnique) {
		const error = new Error('Failed to generate unique room code');
		error.statusCode = 500;
		throw error;
	}

	const passcode = generateRoomPasscode();
	const hashedPasscode = await bcrypt.hash(passcode, 10);

	const room = await Room.create({
		code,
		passcode: hashedPasscode,
	});

	return {
		_id: room._id,
		code: room.code,
		passcode,
	};
}

export async function getRoom({ code, passcode, skipPasscodeCheck = false }) {
	const normalizedCode = String(code || '').trim().toUpperCase();

	if (!normalizedCode) {
		if (skipPasscodeCheck) return null;
		const error = new Error('Invalid room code or passcode.');
		error.statusCode = 401;
		throw error;
	}

	const room = await Room.findOne({
		code: normalizedCode,
	});

	if (!room) {
		if (skipPasscodeCheck) return null;
		const error = new Error('Invalid room code or passcode.');
		error.statusCode = 401;
		throw error;
	}

	if (!skipPasscodeCheck) {
		// Uppercase so users can type the alphanumeric passcode in any case
		// (a no-op for legacy digit-only passcodes).
		const normalizedPasscode = String(passcode || '').trim().toUpperCase();
		const isValidPasscode = normalizedPasscode.length > 0 && await bcrypt.compare(normalizedPasscode, room.passcode);

		if (!isValidPasscode) {
			const error = new Error('Invalid room code or passcode.');
			error.statusCode = 401;
			throw error;
		}
	}

	room.updatedAt = new Date();
	await room.save();

	const roomObj = room.toObject();
	const { passcode: _hash, ...safeRoom } = roomObj;

	return safeRoom;
}

/**
 * Verify a room code + passcode without throwing (for the socket join path).
 * Returns true only when the room exists and the passcode matches.
 */
export async function verifyRoomAccess({ code, passcode }) {
	const normalizedCode = String(code || '').trim().toUpperCase();
	if (!normalizedCode) return false;

	const room = await Room.findOne({ code: normalizedCode });
	if (!room) return false;

	// Uppercase mirrors getRoom: passcodes are stored uppercase, input may be typed lowercase.
	return bcrypt.compare(String(passcode || '').trim().toUpperCase(), room.passcode);
}

export async function updateRoomService({ code, elements, appState, status }) {
	const normalizedCode = String(code || '').trim().toUpperCase();

	if (!normalizedCode) {
		const error = new Error('Invalid room code.');
		error.statusCode = 400;
		throw error;
	}

	const room = await Room.findOne({
		code: normalizedCode,
	});

	if (!room) {
		const error = new Error('Room not found.');
		error.statusCode = 404;
		throw error;
	}

	// Server-authoritative versioning (last-write-wins): the server owns a single
	// monotonically increasing roomVersion. We no longer reject based on the client's
	// own sceneVersion — those counters are per-client and not comparable across
	// clients, which previously left the stored snapshot stuck/stale. Clients stay
	// converged via live LWW canvas_op, so the latest full snapshot is authoritative.
	room.roomVersion = (room.roomVersion || 0) + 1;
	room.elements = elements !== undefined ? elements : room.elements;
	room.appState = appState !== undefined ? appState : room.appState;
	room.status = status !== undefined ? status : room.status;
	await room.save();
}

// ── Authoritative-server persistence (Tier 1) ───────────────────────────────
// A deleted id is remembered this long to block resurrection, then forgotten to
// bound storage. A client offline longer than this would resync from scratch anyway.
export const TOMBSTONE_TTL_MS = Number(process.env.TOMBSTONE_TTL_MS || 60 * 60 * 1000); // 1h
export const MAX_TOMBSTONES = 5000;

// Drop tombstones older than the TTL and cap the total, keeping the most recent.
export function pruneTombstones(tombstones, now = Date.now()) {
	const cutoff = now - TOMBSTONE_TTL_MS;
	let kept = (tombstones || []).filter(
		(t) => t && typeof t.deletedAt === 'number' && t.deletedAt > cutoff && typeof t.id === 'string',
	);
	if (kept.length > MAX_TOMBSTONES) {
		kept = kept.sort((a, b) => b.deletedAt - a.deletedAt).slice(0, MAX_TOMBSTONES);
	}
	return kept;
}

// Read a room's persistent document for in-memory hydration. Returns plain
// objects (lean) or null if the room doesn't exist. Does not touch activity/TTL.
export async function loadRoomDoc(code) {
	const normalizedCode = String(code || '').trim().toUpperCase();
	if (!normalizedCode) return null;

	const room = await Room.findOne({ code: normalizedCode }).lean();
	if (!room) return null;

	return {
		elements: Array.isArray(room.elements) ? room.elements : [],
		tombstones: Array.isArray(room.tombstones) ? room.tombstones : [],
		roomVersion: typeof room.roomVersion === 'number' ? room.roomVersion : 0,
	};
}

// Persist the authoritative in-memory document (server-owned). Replaces the old
// client-pushed snapshot clobber. Prunes tombstones and bumps roomVersion.
export async function persistRoomDoc({ code, elements, tombstones }) {
	const normalizedCode = String(code || '').trim().toUpperCase();
	if (!normalizedCode) {
		const error = new Error('Invalid room code.');
		error.statusCode = 400;
		throw error;
	}

	const room = await Room.findOne({ code: normalizedCode });
	if (!room) {
		const error = new Error('Room not found.');
		error.statusCode = 404;
		throw error;
	}

	room.roomVersion = (room.roomVersion || 0) + 1;
	if (elements !== undefined) room.elements = elements;
	if (tombstones !== undefined) room.tombstones = pruneTombstones(tombstones);
	await room.save();

	return room.roomVersion;
}
