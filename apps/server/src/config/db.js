import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/evodraw';
const client = new MongoClient(uri);

let db;

export async function connectDB() {
    try {
        await client.connect();
        db = client.db();
        console.log('Successfully connected to MongoDB');

        // Ensure TTL index for automatic room expiration (24 hours = 86400 seconds)
        await db.collection('rooms').createIndex(
            { "updatedAt": 1 },
            { expireAfterSeconds: 86400 }
        );
        console.log('TTL Index verified on rooms.updatedAt');

        return db;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}

export function getDB() {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB first.');
    }
    return db;
}

export const clientInstance = client;