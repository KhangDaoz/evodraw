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
