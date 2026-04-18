import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { initFirebase } from './config/firebase.js';
import { initializeSockets } from './sockets/index.js';
import roomRoutes from './routes/room.routes.js';
import fileRoutes from './routes/file.routes.js';

// --- CORS Configuration ---
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(',').map(o => o.trim());

// --- App Initialization ---
const app = express();
const PORT = process.env.PORT || 4000;
const httpServer = createServer(app);

// --- WebSocket Setup ---
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set('socketio', io);
initializeSockets(io);

// --- Global Middleware ---
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            callback(null, true);
        } else {
            console.error(`[CORS Blocked] Origin: ${origin} not in ${ALLOWED_ORIGINS}`);
            // For development/tunnels where origin might change, 
            // you could temporarily just return callback(null, true)
            callback(new Error('Not allowed by CORS'));
        }
    },
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
