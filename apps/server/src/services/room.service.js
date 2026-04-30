import Room from '../models/Room.js';
import bcrypt from 'bcrypt';
import { generateRoomCode, generateRoomPassCode } from '../utils/codeGenerator.js';

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

	const passcode = generateRoomPassCode();
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
		const hasPasscode = typeof passcode === 'string' && passcode.length > 0;
		const isValidPasscode = hasPasscode && await bcrypt.compare(passcode, room.passcode);

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

export async function updateRoomService({ code, roomVersion, elements, appState, status }) {
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

	if (roomVersion !== undefined && roomVersion <= room.roomVersion) {
		const error = new Error('Room version is outdated. Please refresh to get the latest room.');
		error.statusCode = 400;
		throw error;
	}

	room.roomVersion = roomVersion;
	room.elements = elements !== undefined ? elements : room.elements;
	room.appState = appState !== undefined ? appState : room.appState;
	room.status = status !== undefined ? status : room.status;
	await room.save();
}
