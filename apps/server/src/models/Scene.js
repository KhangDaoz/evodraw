import mongoose from 'mongoose';

const SceneSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    roomKey: {
      type: String,
      required: true,
    },
    sceneVersion: {
      type: Number,
      default: 0,
    },
    // annaotions in the scene
    elements: {
      type: Array,
      default: [],
    },
    // (theme, zoom...)
    appState: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Scene', SceneSchema);
