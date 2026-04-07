import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

class Room {
    static getCollection() {
        return getDB().collection('rooms');
    }

    static async create(roomData) {
        const code = typeof roomData?.code === 'string' ? roomData.code.trim().toUpperCase() : '';
        const passcode = typeof roomData?.passcode === 'string' ? roomData.passcode.trim() : '';

        if (!code) throw new Error('Room code is required.');
        if (!passcode) throw new Error('Room passcode is required.');

        const collection = this.getCollection();
        const result = await collection.insertOne({
            code,
            passcode: await bcrypt.hash(passcode, SALT_ROUNDS),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'active',
        });
        return result;
    }

    static async findByCode(code) {
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized) return null;

        const collection = this.getCollection();
        return await collection.findOne({ code: normalized });
    }

    static async verifyAccess(code, passcode) {
        const normalizedCode = String(code || '').trim().toUpperCase();
        const normalizedPasscode = String(passcode || '').trim();
        if (!normalizedCode || !normalizedPasscode) return null;

        const collection = this.getCollection();
        const room = await collection.findOne({ code: normalizedCode });
        if (!room || !room.passcode) return null;

        const isMatch = await bcrypt.compare(normalizedPasscode, room.passcode);
        return isMatch ? room : null;
    }

    static async touch(roomIdentifier) {
        const collection = this.getCollection();
        const normalized = String(roomIdentifier || '').trim();

        if (!normalized) {
            return { matchedCount: 0, modifiedCount: 0 };
        }

        const uppercased = normalized.toUpperCase();

        const isObjectId = /^[a-fA-F0-9]{24}$/.test(normalized);
        const query = isObjectId
            ? { $or: [{ code: uppercased }, { _id: new ObjectId(normalized) }] }
            : { code: uppercased };

        return await collection.updateOne(
            query,
            { $set: { updatedAt: new Date() } },
        );
    }
}

export default Room;
