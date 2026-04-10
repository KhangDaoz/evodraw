import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';

const app = express();
app.use(cors());
app.use(express.json());
connectDB();

app.get('', (req, res) => {
    res.json({ message: 'EvoDraw server is running' });
});

const PORT = process.env.PORT;
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})

// import { Server } from 'socket.io';

// // Configuration & Handlers
// import { initializeSockets } from './sockets/index.js';

// // Routes
// import roomRoutes from './routes/room.routes.js';

// // --- App Initialization ---
// const app = express();
// const PORT = process.env.PORT || 3000;
// const httpServer = createServer(app);

// // --- WebSocket Setup ---
// const io = new Server(httpServer, {
//     cors: {
//         origin: process.env.CLIENT_URL || "http://localhost:5173",
//         methods: ["GET", "POST"],
//         credentials: true
//     }
// });

// app.set('socketio', io);
// initializeSockets(io);

// // --- Global Middleware ---
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // --- REST API Routes ---
// app.use('/api/rooms', roomRoutes);

// app.get('/', (req, res) => {
//     res.json({ message: 'EvoDraw API Server Operations Normal' });
// });

// // --- Error Handling ---
// app.use((err, req, res, next) => {
//     console.error('[Server Error]:', err.message);
//     res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
// });

// // --- Boot Server ---
// connectDB()
//     .then(() => {
//         httpServer.listen(PORT, () => {
//             console.log(`Server is running on http://localhost:${PORT}`);
//         });
//     })
//     .catch((err) => {
//         console.error('Database connection failed:', err.message);
//         process.exit(1);
//     });
