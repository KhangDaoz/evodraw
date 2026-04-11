import Scene from '../models/Scene.js';
import { generateRoomId, generateRoomKey } from '../utils/codeGenerator.js';

// Create a new scene with unique room id and key
export const createScene = async (req, res) => {
    try {
        let roomId = generateRoomId();
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 5) {
            const existingScene = await Scene.findOne({ roomId });
            if (!existingScene) {
                isUnique = true;
            } else {
                roomId = generateRoomId();
                attempts++;
            }
        }

        if (!isUnique) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to generate unique room id' 
            });
        }

        const roomKey = generateRoomKey();

        const newScene = new Scene({
            roomId,
            roomKey,
            elements: [],
            appState: {},
            sceneVersion: 0,
        });

        const savedScene = await newScene.save();
        
        res.status(201).json({
            success: true,
            data: {
                _id: savedScene._id,
                roomId: savedScene.roomId,
                roomKey: savedScene.roomKey,
            }
        });
    } catch (error) {
        console.error('Create scene error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Join a scene with roomId and roomKey verification
export const joinScene = async (req, res) => {
    try {
        const { roomId, roomKey } = req.body || {};

        const scene = await Scene.findOne({ 
            roomId: roomId.toUpperCase(),
            roomKey 
        });

        if (!scene) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid room id or key.' 
            });
        }

        res.status(200).json({
            success: true,
            data: {
                _id: scene._id,
                roomId: scene.roomId,
                roomKey: scene.roomKey,
                elements: scene.elements,
                appState: scene.appState,
                sceneVersion: scene.sceneVersion,
            }
        });
    } catch (error) {
        console.error('Join scene error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
