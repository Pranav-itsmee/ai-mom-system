const fs   = require('fs');
const path = require('path');
const calendarService = require('./calendar.service');
const logger = require('../utils/logger');
const { sendDeadlineReminders } = require('./notification.service');

const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cleanupOldAudioFiles() {
  const tempDir = process.env.TEMP_DIR ? path.resolve(process.env.TEMP_DIR) : null;
  if (!tempDir || !fs.existsSync(tempDir)) return;

  const cutoff = Date.now() - AUDIO_RETENTION_MS;
  let deleted = 0;

  for (const file of fs.readdirSync(tempDir)) {
    if (!file.endsWith('.mp3')) continue;
    const filePath = path.join(tempDir, file);
    try {
      const { mtimeMs } = fs.statSync(filePath);
      if (mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
        logger.debug(`Deleted old audio file: ${filePath}`);
      }
    } catch (err) {
      logger.warn(`Could not check/delete audio file ${filePath}: ${err.message}`);
    }
  }

  if (deleted > 0) logger.info(`Audio cleanup: deleted ${deleted} MP3 file(s) older than 7 days`);
}

// Poll every 30 s to keep calendar in sync
const POLL_INTERVAL_MS      = 30 * 1000;
const REMINDER_INTERVAL_MS  = 24 * 60 * 60 * 1000; // once a day

let intervalHandle   = null;
let reminderInterval = null;

async function runTick() {
  try {
    const synced = await calendarService.syncMeetings();
    if (synced.length > 0) {
      const created = synced.filter((r) => r.created).length;
      logger.info(`Calendar sync: ${created} new, ${synced.length - created} updated`);
    }
  } catch (err) {
    logger.error(`Calendar sync failed: ${err.message}`);
  }
}

function startScheduler() {
  if (intervalHandle) {
    logger.warn('Scheduler already running — ignoring duplicate start');
    return;
  }
  logger.info(`Calendar scheduler started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  runTick();
  intervalHandle = setInterval(runTick, POLL_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();

  // Run deadline reminders + audio cleanup once at startup then once daily
  sendDeadlineReminders();
  cleanupOldAudioFiles();
  reminderInterval = setInterval(() => {
    sendDeadlineReminders();
    cleanupOldAudioFiles();
  }, REMINDER_INTERVAL_MS);
  if (reminderInterval.unref) reminderInterval.unref();
}

function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Calendar scheduler stopped');
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

module.exports = { startScheduler, stopScheduler, runTick };
