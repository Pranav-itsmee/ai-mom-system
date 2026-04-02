const calendarService = require('./calendar.service');
const logger = require('../utils/logger');

// meetBot is required lazily to avoid circular dep issues during boot
let meetBot = null;
function getBot() {
  if (!meetBot) meetBot = require('../bot/meetBot');
  return meetBot;
}

const POLL_INTERVAL_MS = 10 * 1000;   // 5 minutes
const TRIGGER_WINDOW_MIN = 5;              // trigger bot 2 min before start

let intervalHandle = null;

/**
 * One scheduler tick:
 * 1. Sync Google Calendar → upsert meetings in DB
 * 2. Find meetings starting within TRIGGER_WINDOW_MIN
 * 3. Tell the bot to join each qualifying meeting
 */
async function runTick() {
  logger.debug('Scheduler tick — syncing calendar…');

  try {
    const synced = await calendarService.syncMeetings();
    if (synced.length > 0) {
      const created = synced.filter((r) => r.created).length;
      const updated = synced.length - created;
      logger.info(`Calendar sync: ${created} new, ${updated} updated`);
    }
  } catch (err) {
    logger.error(`Calendar sync failed: ${err.message}`);
    // Don't exit — still check for meetings that may already be in DB
  }

  try {
    const imminent = await calendarService.getMeetingsStartingSoon(TRIGGER_WINDOW_MIN);
    for (const meeting of imminent) {
      logger.info(`Scheduler: triggering bot for "${meeting.title}" (id=${meeting.id})`);
      getBot()
        .joinMeeting(meeting)
        .catch((err) => logger.error(`Bot join error for meeting ${meeting.id}: ${err.message}`));
    }
  } catch (err) {
    logger.error(`Scheduler trigger check failed: ${err.message}`);
  }
}

/**
 * Start the background scheduler.
 * Runs once immediately, then every POLL_INTERVAL_MS.
 * Call this after the database is ready.
 */
function startScheduler() {
  if (intervalHandle) {
    logger.warn('Scheduler already running — ignoring duplicate start');
    return;
  }

  logger.info(`Calendar scheduler started (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  // First tick immediately so we don't wait 5 minutes on boot
  runTick();

  intervalHandle = setInterval(runTick, POLL_INTERVAL_MS);

  // Prevent the interval from blocking Node.js process exit
  if (intervalHandle.unref) intervalHandle.unref();
}

function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Calendar scheduler stopped');
  }
}

module.exports = { startScheduler, stopScheduler, runTick };
