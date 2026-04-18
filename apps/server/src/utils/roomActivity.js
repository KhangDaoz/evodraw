import Room from '../models/Room.js';

const ROOM_ACTIVITY_TOUCH_INTERVAL_MS = Number(process.env.ROOM_ACTIVITY_TOUCH_INTERVAL_MS || 5000);
const lastTouchedAtByRoom = new Map();

export async function markRoomActivity(code, options = {}) {
    const { force = false } = options;
    const normalizedCode = String(code || '').trim().toUpperCase();

    if (!normalizedCode) {
        return;
    }

    const now = Date.now();
    const lastTouchedAt = lastTouchedAtByRoom.get(normalizedCode) || 0;

    if (!force && now - lastTouchedAt < ROOM_ACTIVITY_TOUCH_INTERVAL_MS) {
        return;
    }

    lastTouchedAtByRoom.set(normalizedCode, now);

    try {
        await Room.updateOne(
            { code: normalizedCode },
            { $set: { updatedAt: new Date() } }
        );
    } catch (error) {
        console.error(`Failed to update room activity for ${normalizedCode}:`, error.message);
    }
}
