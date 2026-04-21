const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes         = require('./routes/auth.routes');
const meetingRoutes      = require('./routes/meeting.routes');
const momRoutes          = require('./routes/mom.routes');
const taskRoutes         = require('./routes/task.routes');
const notificationRoutes = require('./routes/notification.routes');
const userRoutes         = require('./routes/user.routes');
const errorHandler       = require('./middleware/errorHandler');

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow: no origin (curl/Postman), frontend URL, Chrome extensions
      if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
        cb(null, true);
      } else {
        cb(null, true); // open for self-hosted — restrict via ALLOWED_ORIGINS in production
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded avatars as static files
app.use('/avatars', express.static(path.resolve(__dirname, '../public/avatars')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/meetings',      meetingRoutes);
app.use('/api/v1/mom',           momRoutes);
app.use('/api/v1/tasks',         taskRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/users',         userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
