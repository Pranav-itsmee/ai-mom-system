const { google } = require('googleapis');
const { Op } = require('sequelize');
const { getAuthenticatedClient } = require('../config/googleAuth');
const { Meeting } = require('../models');
const logger = require('../utils/logger');

/**
 * Fetch all Google Calendar events for the next 24 hours that have a
 * Google Meet conference link attached.
 */
async function fetchUpcomingEvents() {
  const auth = getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: tomorrow.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  return events.filter((event) =>
    event.conferenceData?.entryPoints?.some((ep) => ep.entryPointType === 'video')
  );
}

/**
 * Extract the Google Meet video URL from a calendar event.
 */
function extractMeetLink(event) {
  const ep = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return ep?.uri || null;
}

/**
 * Sync upcoming Google Calendar meetings into the local DB.
 * Uses google_event_id as the unique key — creates new or updates existing.
 * Returns an array of { meeting, created } objects.
 */
async function syncMeetings() {
  const events = await fetchUpcomingEvents();
  const results = [];

  for (const event of events) {
    const meetLink = extractMeetLink(event);
    if (!meetLink) continue;

    const scheduledAt = new Date(event.start?.dateTime || event.start?.date);
    const title = event.summary || 'Untitled Meeting';

    const existing = await Meeting.findOne({ where: { google_event_id: event.id } });

    if (existing) {
      await existing.update({ title, meet_link: meetLink, scheduled_at: scheduledAt });
      results.push({ meeting: existing, created: false });
      logger.debug(`Updated meeting from calendar: "${title}"`);
    } else {
      const meeting = await Meeting.create({
        google_event_id: event.id,
        title,
        meet_link: meetLink,
        scheduled_at: scheduledAt,
        status: 'scheduled',
      });
      results.push({ meeting, created: true });
      logger.info(`New meeting synced from calendar: "${title}" at ${scheduledAt.toISOString()}`);
    }
  }

  return results;
}

/**
 * Return all scheduled meetings whose start time is within the next
 * `withinMinutes` minutes. These are candidates for the bot to join.
 */
async function getMeetingsStartingSoon(withinMinutes = 2) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinMinutes * 60 * 1000);

  return Meeting.findAll({
    where: {
      status: 'scheduled',
      meet_link: { [Op.ne]: null },
      scheduled_at: {
        [Op.gte]: now,
        [Op.lte]: cutoff,
      },
    },
  });
}

module.exports = { syncMeetings, getMeetingsStartingSoon, fetchUpcomingEvents };
