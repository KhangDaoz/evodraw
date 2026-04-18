import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    // (image/png, application/json...)
    mimeType: {
      type: String,
      required: true,
    },
    // (URL on cloud)
    dataURL: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    lastRetrieved: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created', updatedAt: false },
  }
);

FileSchema.index({ roomId: 1, fileId: 1 }, { unique: true });

export default mongoose.model('File', FileSchema);
