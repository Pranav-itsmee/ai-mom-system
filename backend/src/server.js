require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./config/db');
const logger = require('./utils/logger');
const { ensureUserSecurityColumns } = require('./services/schema.service');
const { startScheduler, stopScheduler } = require('./services/scheduler.service');
const { backfillAttendeeNames } = require('./services/calendar.service');

const PORT = parseInt(process.env.PORT) || 5000;

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established.');

    // In production, replace sync({alter}) with proper Sequelize migrations
    await sequelize.sync();
    logger.info('Database schema synced.');
    await ensureUserSecurityColumns();
    logger.info('User security columns ensured.');

    // Backfill attendee names for any rows missing them (runs once, no-op when all filled)
    backfillAttendeeNames()
      .then(() => logger.info('Attendee name backfill complete.'))
      .catch((err) => logger.warn('Attendee name backfill failed (non-fatal):', err.message));

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    // Start the Google Calendar polling scheduler (every 5 min)
    // Only run in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      startScheduler();
    }

    // Graceful shutdown
    function shutdown(signal) {
      logger.info(`${signal} received — shutting down gracefully`);
      stopScheduler();
      server.close(() => {
        logger.info('HTTP server closed');
        sequelize.close().then(() => process.exit(0));
      });
      // Force exit after 10 s if graceful close hangs
      setTimeout(() => process.exit(1), 10_000).unref();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
