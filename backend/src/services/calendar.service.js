const { google } = require('googleapis');
const { Op } = require('sequelize');
const { getAuthenticatedClient, getOAuthClient } = require('../config/googleAuth');
const { Meeting, MeetingAttendee, User } = require('../models');
const logger = require('../utils/logger');

function normalizeMeetingTitle(title) {
  return String(title || '')
    .replace(/^meet\s*-\s*/i, '')
    .trim()
    .toLowerCase();
}

// Derive a readable name from an email address when no displayName is available
// e.g. "pranav.itsmee.official@gmail.com" → "Pranav Itsmee Official"
function nameFromEmail(email) {
  if (!email) return null;
  const local = email.split('@')[0];
  return local
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

async function findRecordingCreatedMeeting(title, scheduledAt) {
  const normalizedTitle = normalizeMeetingTitle(title);
  if (!normalizedTitle) return null;

  const lowerBound = new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000);
  const upperBound = new Date(scheduledAt.getTime() + 12 * 60 * 60 * 1000);
  const candidates = await Meeting.findAll({
    where: {
      google_event_id: null,
      meet_link: null,
      scheduled_at: { [Op.between]: [lowerBound, upperBound] },
    },
    order: [['scheduled_at', 'ASC']],
  });

  return candidates.find((m) => normalizeMeetingTitle(m.title) === normalizedTitle) || null;
}

/**
 * Look up the real display name for an email address using multiple Google APIs:
 * 1. People API — otherContacts (Gmail/Meet interaction history)
 * 2. People API — searchContacts (full saved contacts list)
 * 3. Admin Directory API — Workspace users in the same org
 * Returns null if none of the sources have the contact.
 */
async function fetchProfileName(auth, email) {
  const people = google.people({ version: 'v1', auth });

  // 1. Other contacts (people interacted with via Gmail / Meet)
  try {
    const res = await people.otherContacts.search({
      query: email, readMask: 'names,emailAddresses', pageSize: 5,
    });
    for (const r of res.data.results ?? []) {
      const matched = (r.person?.emailAddresses ?? []).some((e) => e.value === email);
      if (matched) {
        const name = r.person?.names?.[0]?.displayName;
        if (name) return name;
      }
    }
  } catch { /* scope missing or no results */ }

  // 2. Full contacts list
  try {
    const res = await people.people.searchContacts({
      query: email, readMask: 'names,emailAddresses', pageSize: 5,
    });
    for (const r of res.data.results ?? []) {
      const matched = (r.person?.emailAddresses ?? []).some((e) => e.value === email);
      if (matched) {
        const name = r.person?.names?.[0]?.displayName;
        if (name) return name;
      }
    }
  } catch { /* scope missing or no results */ }

  // 3. Google Workspace Directory (only works if attendee is in the same org)
  try {
    const admin = google.admin({ version: 'directory_v1', auth });
    const res = await admin.users.get({ userKey: email });
    const name = res.data.name?.fullName ?? res.data.name?.givenName;
    if (name) return name;
  } catch { /* not a Workspace user or scope missing */ }

  return null;
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
 * Sync upcoming Google Calendar meetings into the local DB for a specific auth client.
 * Uses google_event_id as the unique key — creates new or updates existing.
 * Returns an array of { meeting, created } objects.
 *
 * @param {object} authClient  - googleapis OAuth2 client (user-specific or shared)
 * @param {number|null} syncUserId - the user ID whose calendar is being synced (sets created_by)
 */
async function syncMeetingsForAuth(authClient, syncUserId = null) {
  const auth   = authClient;
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

  const rawEvents = (res.data.items || []).filter((event) =>
    event.conferenceData?.entryPoints?.some((ep) => ep.entryPointType === 'video')
  );
  const results = [];

  for (const event of rawEvents) {
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

    // created_by: prefer organizer user, fall back to the user who triggered the sync
    const createdBy = organizerId ?? syncUserId;

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
      const recordingCreated = await findRecordingCreatedMeeting(title, scheduledAt);
      if (recordingCreated) {
        const updates = {
          google_event_id: event.id,
          title,
          meet_link: meetLink,
          scheduled_at: scheduledAt,
          organizer_name: organizerName,
          organizer_email: organizerEmail,
        };
        if (organizerId) updates.organizer_id = organizerId;
        if (createdBy) updates.created_by = createdBy;
        await recordingCreated.update(updates);
        meeting = recordingCreated;
        results.push({ meeting, created: false });
        logger.info(`Merged recording-created meeting with calendar event: "${title}"`);
      } else {
      meeting = await Meeting.create({
        google_event_id: event.id,
        title,
        meet_link: meetLink,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        organizer_name:  organizerName,
        organizer_email: organizerEmail,
        ...(organizerId  ? { organizer_id: organizerId } : {}),
        ...(createdBy    ? { created_by:   createdBy   } : {}),
      });
      results.push({ meeting, created: true });
      logger.info(`New meeting synced from calendar: "${title}" at ${scheduledAt.toISOString()}`);
      }
    }

    // ── Attendee sync ────────────────────────────────────────────────────────
    // Build the canonical attendee list from the calendar event.
    // event.attendees entries often have the best displayName for the organizer,
    // so we look up the organizer's name there first before falling back.
    const calAttendees = Array.isArray(event.attendees) ? [...event.attendees] : [];

    // If organizer is not already in the list, add them
    if (organizerEmail && !calAttendees.some((a) => a.email === organizerEmail)) {
      calAttendees.push({ email: organizerEmail, displayName: organizerName, organizer: true });
    }

    // Try to fill in organizer display name from their attendee entry if still missing
    if (!organizerName) {
      const orgEntry = calAttendees.find((a) => a.email === organizerEmail);
      if (orgEntry?.displayName) {
        organizerName = orgEntry.displayName;
        await meeting.update({ organizer_name: organizerName });
      }
    }

    for (const attendee of calAttendees) {
      if (!attendee.email) continue;

      // responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction'
      // organizer is always considered present
      const isDeclined = attendee.responseStatus === 'declined' && !attendee.organizer;
      const attendeeStatus = isDeclined ? 'absent' : 'present';

      const matchedUser = await User.findOne({ where: { email: attendee.email } });

      // Best name: calendar displayName → system user name → People API (3 sources) → null
      const resolvedName =
        attendee.displayName
        ?? matchedUser?.name
        ?? await fetchProfileName(auth, attendee.email)
        ?? null;

      // Upsert: always refresh name, user_id, and status from the latest calendar data
      const existing = await MeetingAttendee.findOne({
        where: { meeting_id: meeting.id, email: attendee.email },
      });

      if (existing) {
        await existing.update({
          name:    resolvedName ?? existing.name,
          user_id: matchedUser?.id ?? existing.user_id ?? null,
          status:  attendeeStatus,
        });
      } else {
        await MeetingAttendee.create({
          meeting_id: meeting.id,
          email:      attendee.email,
          name:       resolvedName,
          user_id:    matchedUser?.id ?? null,
          status:     attendeeStatus,
        });
      }
    }
  }

  return results;
}

/**
 * Sync ALL users who have connected their Google Calendar.
 * Each user's calendar is checked independently using their stored refresh token.
 * google_event_id deduplicates — if two users are in the same meeting, it's only created once.
 */
async function syncAllUserCalendars() {
  const users = await User.findAll({
    where:      { google_refresh_token: { [Op.ne]: null } },
    attributes: ['id', 'name', 'email', 'google_refresh_token'],
  });

  if (!users.length) {
    logger.debug('Calendar sync: no users have connected Google Calendar');
    return [];
  }

  const allResults = [];
  for (const user of users) {
    try {
      const authClient = _getUserAuthClient(user.google_refresh_token);
      const results    = await syncMeetingsForAuth(authClient, user.id);
      if (results.some(r => r.created)) {
        logger.info(`Calendar sync [${user.email}]: ${results.filter(r => r.created).length} new meeting(s)`);
      }
      allResults.push(...results);
    } catch (err) {
      logger.error(`Calendar sync failed for user ${user.email}: ${err.message}`);
    }
  }
  return allResults;
}

/**
 * Legacy wrapper — kept so existing code that calls syncMeetings() still works.
 * Delegates to syncAllUserCalendars() when users have connected their accounts,
 * otherwise falls back to the shared GOOGLE_REFRESH_TOKEN in .env.
 */
async function syncMeetings() {
  const connectedCount = await User.count({
    where: { google_refresh_token: { [Op.ne]: null } },
  });

  if (connectedCount > 0) {
    return syncAllUserCalendars();
  }

  // Fallback: shared bot token
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    logger.debug('Calendar sync: no users connected and no GOOGLE_REFRESH_TOKEN set — skipping');
    return [];
  }
  logger.debug('Calendar sync: using shared GOOGLE_REFRESH_TOKEN (no per-user tokens found)');
  return syncMeetingsForAuth(getAuthenticatedClient(), null);
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

/**
 * Build an OAuth2 client for a specific user's refresh token.
 */
function _getUserAuthClient(refreshToken) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Fetch all Google Calendar events (not just Meet events) for a date range.
 * If userRefreshToken is provided, uses per-user auth; falls back to shared token.
 */
async function fetchCalendarEventsForRange(timeMin, timeMax, userRefreshToken = null) {
  const auth = userRefreshToken
    ? _getUserAuthClient(userRefreshToken)
    : getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  return (res.data.items || []).map((event) => ({
    id:          event.id,
    title:       event.summary || '(No title)',
    start:       event.start?.dateTime || event.start?.date,
    end:         event.end?.dateTime   || event.end?.date,
    allDay:      !event.start?.dateTime,
    location:    event.location || null,
    description: event.description || null,
    meetLink:    extractMeetLink(event),
    organizer:   event.organizer?.displayName || event.organizer?.email || null,
    status:      event.status,
    htmlLink:    event.htmlLink,
  }));
}

module.exports = { syncMeetings, syncMeetingsForAuth, syncAllUserCalendars, getMeetingsInJoinWindow, fetchUpcomingEvents, backfillAttendeeNames, fetchCalendarEventsForRange };
