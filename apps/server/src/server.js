import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// Configuration & Handlers
import { connectDB } from './config/db.js';
import { initializeSockets } from './sockets/index.js';
import { initFirebase } from './config/firebase.js';

// Routes
import roomRoutes from './routes/room.routes.js';
import fileRoutes from './routes/file.routes.js';

// --- App Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

// --- WebSocket Setup ---
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set('socketio', io);
initializeSockets(io);

// --- Global Middleware ---
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- REST API Routes ---
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomId/files', fileRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'EvoDraw API Server Operations Normal' });
});

// --- Error Handling ---
app.use((err, req, res, next) => {
    console.error('[Server Error]:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// --- Boot Server ---
connectDB()
    .then(() => {
        initFirebase();
        httpServer.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });
