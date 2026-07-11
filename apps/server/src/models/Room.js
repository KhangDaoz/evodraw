import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        passcode: {
            type: String,
            required: true,
        },
        roomVersion: {
            type: Number,
            default: 0,
        },
        // annaotions in the room
        elements: {
            type: Array,
            default: [],
        },
        // (theme, zoom...)
        appState: {
            type: Object,
            default: {},
        },
        // Deleted element ids (LWW tombstones) so a delete survives a server
        // restart — otherwise a client that was offline during the delete could
        // re-introduce the object after the server rehydrates from the DB.
        // Bounded + pruned by age at persist time (see room.service.persistRoomDoc).
        tombstones: {
            type: [
                {
                    _id: false,
                    id: { type: String, required: true },
                    deletedAt: { type: Number, required: true },
                },
            ],
            default: [],
        },
        status: {
            type: String,
            default: 'active',
        },
    },
    {
        timestamps: true,
        minimize: false,
    }
);

// Auto-delete rooms after 24h of inactivity
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

const Room = mongoose.model('Room', roomSchema);

export default Room;
