import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);

    return mongoose.connection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
}

export default connectDB;

// export async function initializeIndexes() {
//   try {
//     // Keep room documents alive for 24h since last activity.
//     await mongoose.connection.collection('rooms').createIndex(
//       { updatedAt: 1 },
//       { expireAfterSeconds: 86400 }
//     );
//     console.log('TTL Index verified on rooms.updatedAt');
//   } catch (error) {
//     console.error('Error creating indexes:', error.message);
//   }
// }