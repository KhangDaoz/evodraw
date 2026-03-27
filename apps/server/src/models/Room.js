const { getDB } = require('../config/db');

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

    static async touch(code) {
        const collection = this.getCollection();
        return await collection.updateOne(
            { code },
            { $set: { updatedAt: new Date() } }
        );
    }
}

module.exports = Room;
