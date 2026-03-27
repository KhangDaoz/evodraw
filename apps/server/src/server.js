require('dotenv').config();

const express = require('express');
const { connectDB } = require('./config/db');
const roomRoutes = require('./routes/room.routes');

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