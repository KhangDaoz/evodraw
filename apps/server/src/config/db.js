import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/evodraw';

export async function connectDB() {
    try {
        if (mongoose.connection.readyState === 1) {
            return mongoose.connection;
        }

        await mongoose.connect(uri);
        console.log(`MongoDB connected: ${mongoose.connection.host}`);

        return mongoose.connection;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
}