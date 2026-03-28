import Room from '../models/Room.js';

const ROOM_ACTIVITY_TOUCH_INTERVAL_MS = Number(process.env.ROOM_ACTIVITY_TOUCH_INTERVAL_MS || 5000);
const lastTouchedAtByRoom = new Map();

export async function markRoomActivity(roomId, options = {}) {
    const { force = false } = options;
    const normalizedRoomId = String(roomId || '').trim();

    if (!normalizedRoomId) {
        return;
    }

    const now = Date.now();
    const lastTouchedAt = lastTouchedAtByRoom.get(normalizedRoomId) || 0;

    if (!force && now - lastTouchedAt < ROOM_ACTIVITY_TOUCH_INTERVAL_MS) {
        return;
    }

    lastTouchedAtByRoom.set(normalizedRoomId, now);

    try {
        await Room.touch(normalizedRoomId);
    } catch (error) {
        console.error(`Failed to update room activity for ${normalizedRoomId}:`, error.message);
    }
}
