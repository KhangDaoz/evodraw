import Scene from '../models/Scene.js';

// Create a new scene
export const createScene = async (req, res) => {
  const { roomId, roomKey, elements, appState, sceneVersion } = req.body;
  try {
    const existingScene = await Scene.findOne({ roomId });
    if (existingScene) {
      return res.status(409).json({message: 'Room is already exists'});
    }

    const newScene = new Scene({
      roomId,
      roomKey: roomKey,
      elements: elements || [],
      appState: appState || {},
      sceneVersion: sceneVersion || 0,
    });

    const savedScene = await newScene.save();
    res.status(201).json(savedScene);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a scene by roomId
export const getScene = async (req, res) => {
  try {
    const scene = await Scene.findOne({ roomId: req.params.roomId });
    if (!scene) {
      return res.status(404).json({ message: 'Not found room' });
    }
    res.status(200).json(scene);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a scene
export const updateScene = async (req, res) => {
  const { roomId } = req.params;
  const { elements, appState, sceneVersion } = req.body;
  try {
    const updateData = {};
    if (elements !== undefined) updateData.elements = elements;
    if (appState !== undefined) updateData.appState = appState;
    if (sceneVersion !== undefined) updateData.sceneVersion = sceneVersion;

    const updatedScene = await Scene.findOneAndUpdate(
      { roomId },
      updateData,
      { new: true }
    );

    if (!updatedScene) {
      return res.status(404).json({ message: 'Not found room' });
    }

    res.status(200).json(updatedScene);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
