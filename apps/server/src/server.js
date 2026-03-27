import 'dotenv/config';

import express from 'express';
import { connectDB } from './config/db.js';
import roomRoutes from './routes/room.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/rooms', roomRoutes);

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

// Database Connection & Server Start
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});