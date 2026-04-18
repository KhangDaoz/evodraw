import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { initializeSockets } from './sockets/index.js';
import roomRoutes from './routes/room.routes.js';

const app = express();
app.use(cors());
app.use(express.json());
connectDB();

// Routes
app.use('/api/scene', sceneRoutes);

app.get('', (req, res) => {
    res.json({ message: 'EvoDraw server is running' });
});

const PORT = process.env.PORT;
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})