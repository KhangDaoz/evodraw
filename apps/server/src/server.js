import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { initFirebase } from './config/firebase.js';
import { initializeSockets } from './sockets/index.js';
import { TRUST_PROXY } from './utils/clientIp.js';
import roomRoutes from './routes/room.routes.js';
import fileRoutes from './routes/file.routes.js';

// Refuse to boot on a missing/weak TOKEN_SECRET or (in production) a missing
// MONGODB_URI, rather than failing lazily at the first request.
validateEnv();

// cors configuration - allow localhost and any origins specified in .env
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(',').map(o => o.trim());
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !process.env.ALLOWED_ORIGINS) {
    console.warn('[CORS] NODE_ENV=production but ALLOWED_ORIGINS is unset — only the desktop (null origin) will be accepted, no browser origins. Set ALLOWED_ORIGINS to your frontend URL(s).');
}

// A request is allowed when it has no Origin (non-browser client), an opaque
// "null" origin (packaged Electron desktop app loaded from file://), or an
// origin explicitly listed in ALLOWED_ORIGINS. Any-localhost-port is a dev-only
// convenience and is NOT accepted in production (a local malicious page could
// otherwise make credentialed requests). Socket and REST access are still gated
// by the JWT auth middleware, so this only governs which browsers/clients may
// talk to the API, not authorization.
const isAllowedOrigin = (origin) =>
    !origin ||
    origin === 'null' ||
    ALLOWED_ORIGINS.includes(origin) ||
    (!IS_PRODUCTION &&
        (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')));

// app initialization
const app = express();
const PORT = process.env.PORT || 4000;
const httpServer = createServer(app);

// Behind a reverse proxy (Render), req.ip is the proxy's address unless Express is
// told to trust the X-Forwarded-For hop. Without this every client shares one
// rate-limit bucket, and express-rate-limit v8 throws on the unexpected header.
if (TRUST_PROXY) {
    app.set('trust proxy', 1);
}

// socket.io initialization with CORS settings
const io = new Server(httpServer, {
    // Socket.IO's 1 MB default silently truncates (and disconnects) senders well below
    // the sync layer's own limits. Keep this in step with MAX_SNAPSHOT_BYTES in
    // sockets/draw.handler.js, which is what actually validates the payloads.
    maxHttpBufferSize: 10_000_000,
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
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

// global middleware
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            console.error(`[CORS Blocked] Origin: ${origin} not in ${ALLOWED_ORIGINS}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['Authorization']
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// routes
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomCode/files', fileRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'EvoDraw API Server Operations Normal' });
});

// Readiness probe: reports unhealthy when MongoDB is unreachable, so a load
// balancer stops routing here instead of serving requests that will fail.
app.get('/health', async (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) {
        return res.status(503).json({ status: 'unhealthy', db: 'disconnected' });
    }
    try {
        await mongoose.connection.db.admin().ping();
        res.json({ status: 'ok', db: 'connected', uptime: Math.round(process.uptime()) });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', db: 'ping failed' });
    }
});

// error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server Error]:', err.message);
    // Don't leak internal error text (stack-adjacent details, driver messages) to
    // clients in production.
    const message = IS_PRODUCTION
        ? 'Internal Server Error'
        : (err.message || 'Internal Server Error');
    res.status(err.status || 500).json({ success: false, error: message });
});

// start server after connecting to database and initializing Firebase
connectDB().then(() => {
        initFirebase();
        httpServer.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });
