import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

class Room {
    static getCollection() {
        return getDB().collection('rooms');
    }

    static async create(roomData) {
        const collection = this.getCollection();
        const result = await collection.insertOne({
            ...roomData,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'active'
        });
        return result;
    }

    static async findByCode(code) {
        const collection = this.getCollection();
        return await collection.findOne({ code });
    }

    static async verifyAccess(code, passcode) {
        const collection = this.getCollection();
        return await collection.findOne({ code, passcode });
    }

    static async touch(roomIdentifier) {
        const collection = this.getCollection();
        const normalized = String(roomIdentifier || '').trim();

        if (!normalized) {
            return { matchedCount: 0, modifiedCount: 0 };
        }

        const query = ObjectId.isValid(normalized)
            ? { $or: [{ code: normalized.toUpperCase() }, { _id: new ObjectId(normalized) }] }
            : { code: normalized.toUpperCase() };

        return await collection.updateOne(
            query,
            { $set: { updatedAt: new Date() } }
        );
    }
}

export default Room;
