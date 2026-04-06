const calendarService = require('./calendar.service');
const logger = require('../utils/logger');

let meetBot = null;
function getBot() {
  if (!meetBot) meetBot = require('../bot/meetBot');
  return meetBot;
}

// Poll every 30 s so we can hit the 2-minute window accurately.
const POLL_INTERVAL_MS   = 30 * 1000;
// Join exactly 2 minutes before start — window is ±30 s around that target.
const JOIN_BEFORE_MS     = 2 * 60 * 1000;       // 120 s
const WINDOW_HALF_MS     = 30 * 1000;            //  ±30 s tolerance

let intervalHandle = null;

async function runTick() {
  logger.debug('Scheduler tick — syncing calendar…');

  try {
    const synced = await calendarService.syncMeetings();
    if (synced.length > 0) {
      const created = synced.filter((r) => r.created).length;
      logger.info(`Calendar sync: ${created} new, ${synced.length - created} updated`);
    }
  } catch (err) {
    logger.error(`Calendar sync failed: ${err.message}`);
  }

  try {
    const imminent = await calendarService.getMeetingsInJoinWindow(
      JOIN_BEFORE_MS,
      WINDOW_HALF_MS,
    );
    for (const meeting of imminent) {
      const secsUntil = Math.round((new Date(meeting.scheduled_at) - Date.now()) / 1000);
      logger.info(
        `Scheduler: joining "${meeting.title}" (id=${meeting.id}) — starts in ${secsUntil}s`,
      );
      getBot()
        .joinMeeting(meeting)
        .catch((err) =>
          logger.error(`Bot join error for meeting ${meeting.id}: ${err.message}`),
        );
    }
  } catch (err) {
    logger.error(`Scheduler trigger check failed: ${err.message}`);
  }
}

function startScheduler() {
  if (intervalHandle) {
    logger.warn('Scheduler already running — ignoring duplicate start');
    return;
  }
  logger.info(
    `Calendar scheduler started — polling every ${POLL_INTERVAL_MS / 1000}s, ` +
    `joining ${JOIN_BEFORE_MS / 1000}s before start (±${WINDOW_HALF_MS / 1000}s)`,
  );
  runTick();
  intervalHandle = setInterval(runTick, POLL_INTERVAL_MS);
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
