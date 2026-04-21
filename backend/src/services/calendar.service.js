const { google } = require('googleapis');
const { Op } = require('sequelize');
const { getAuthenticatedClient } = require('../config/googleAuth');
const { Meeting, MeetingAttendee, User } = require('../models');
const logger = require('../utils/logger');

/**
 * Look up the Google profile display name for an email address using the
 * People API "Other Contacts" (people interacted with via Gmail / Meet).
 * Returns null silently if the scope is missing or the contact isn't found.
 */
async function fetchProfileName(auth, email) {
  try {
    const people = google.people({ version: 'v1', auth });
    const res = await people.otherContacts.search({
      query: email,
      readMask: 'names,emailAddresses',
      pageSize: 5,
    });
    for (const r of res.data.results ?? []) {
      const matched = (r.person?.emailAddresses ?? []).some((e) => e.value === email);
      if (matched) return r.person?.names?.[0]?.displayName ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

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
  const auth   = getAuthenticatedClient();
  const events = await fetchUpcomingEvents();
  const results = [];

  for (const event of events) {
    const meetLink = extractMeetLink(event);
    if (!meetLink) continue;

    const scheduledAt = new Date(event.start?.dateTime || event.start?.date);
    const title = event.summary || 'Untitled Meeting';

    // Resolve organizer from event.organizer
    let organizerId   = null;
    let organizerName  = event.organizer?.displayName ?? null;
    let organizerEmail = event.organizer?.email ?? null;
    if (organizerEmail) {
      const orgUser = await User.findOne({ where: { email: organizerEmail } });
      if (orgUser) {
        organizerId   = orgUser.id;
        organizerName = organizerName ?? orgUser.name;
      }
    }

    const existing = await Meeting.findOne({ where: { google_event_id: event.id } });
    let meeting;

    if (existing) {
      const updates = {
        title, meet_link: meetLink, scheduled_at: scheduledAt,
        organizer_name: organizerName, organizer_email: organizerEmail,
      };
      if (organizerId) updates.organizer_id = organizerId;
      await existing.update(updates);
      meeting = existing;
      results.push({ meeting, created: false });
      logger.debug(`Updated meeting from calendar: "${title}"`);
    } else {
      meeting = await Meeting.create({
        google_event_id: event.id,
        title,
        meet_link: meetLink,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        organizer_name:  organizerName,
        organizer_email: organizerEmail,
        ...(organizerId ? { organizer_id: organizerId } : {}),
      });
      results.push({ meeting, created: true });
      logger.info(`New meeting synced from calendar: "${title}" at ${scheduledAt.toISOString()}`);
    }

    // Sync attendees from event.attendees; also ensure organizer is included
    const calAttendees = Array.isArray(event.attendees) ? [...event.attendees] : [];
    if (organizerEmail && !calAttendees.some((a) => a.email === organizerEmail)) {
      calAttendees.push({ email: organizerEmail, displayName: organizerName });
    }
    for (const attendee of calAttendees) {
      if (!attendee.email) continue;
      const matchedUser = await User.findOne({ where: { email: attendee.email } });
      const resolvedName = attendee.displayName
        ?? matchedUser?.name
        ?? await fetchProfileName(auth, attendee.email);
      const [, created] = await MeetingAttendee.findOrCreate({
        where: { meeting_id: meeting.id, email: attendee.email },
        defaults: {
          meeting_id: meeting.id,
          email: attendee.email,
          name: resolvedName ?? null,
          user_id: matchedUser?.id ?? null,
        },
      });
      if (!created && (resolvedName || matchedUser)) {
        await MeetingAttendee.update(
          { name: resolvedName ?? null, user_id: matchedUser?.id ?? null },
          { where: { meeting_id: meeting.id, email: attendee.email } },
        );
      }
    }
  }

  return results;
}

/**
 * Return meetings that should be joined right now — i.e. whose start time
 * falls within the join window:  [now + targetMs - halfMs, now + targetMs + halfMs]
 *
 * Example with defaults (targetMs=120 000, halfMs=30 000):
 *   Only meetings starting 90 – 150 seconds from now are returned.
 *   Bot is triggered when the meeting is exactly ~2 minutes away.
 *
 * @param {number} targetMs  - How far ahead to target (ms). Default 2 min.
 * @param {number} halfMs    - Half-width of the window (ms). Default 30 s.
 */
async function getMeetingsInJoinWindow(targetMs = 120_000, halfMs = 30_000) {
  const now        = new Date();
  const lowerBound = new Date(now.getTime() + targetMs - halfMs);
  const upperBound = new Date(now.getTime() + targetMs + halfMs);

  return Meeting.findAll({
    where: {
      status:    'scheduled',
      meet_link: { [Op.ne]: null },
      scheduled_at: {
        [Op.gte]: lowerBound,
        [Op.lte]: upperBound,
      },
    },
  });
}

/**
 * One-time backfill: populate name + user_id for all meeting_attendees rows
 * where name is currently null.
 *  1. Match by email → users table (fast, no API call)
 *  2. For any still-null, call Google People API (otherContacts)
 */
async function backfillAttendeeNames() {
  const nullRows = await MeetingAttendee.findAll({ where: { name: null } });
  if (!nullRows.length) return;

  const auth = getAuthenticatedClient();

  for (const att of nullRows) {
    if (!att.email) continue;

    // Step 1: match to a system user
    const user = await User.findOne({ where: { email: att.email } });
    if (user) {
      await att.update({ name: user.name, user_id: user.id });
      continue;
    }

    // Step 2: Google People API lookup
    const name = await fetchProfileName(auth, att.email);
    if (name) await att.update({ name });
  }
}

module.exports = { syncMeetings, getMeetingsInJoinWindow, fetchUpcomingEvents, backfillAttendeeNames };
