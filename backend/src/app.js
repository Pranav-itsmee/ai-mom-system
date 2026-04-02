const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const meetingRoutes = require('./routes/meeting.routes');
const momRoutes = require('./routes/mom.routes');
const taskRoutes = require('./routes/task.routes');
const bmsRoutes = require('./routes/bms.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/mom', momRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/bms', bmsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
