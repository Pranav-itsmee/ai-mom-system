const { Op } = require('sequelize');
const { Meeting, User, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../models');
const logger = require('../utils/logger');
const { getMeetingAccessLevel, accessibleMeetingIds } = require('../utils/meetingAccess');

function describeError(err) {
  if (!err) return 'Unknown error';
  if (err.stack) return err.stack;
  return err.message || String(err);
}

function normalizeMeetCode(meetLink) {
  if (!meetLink) return null;
  const match = String(meetLink).match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return match?.[1]?.toLowerCase() || null;
}

function normalizeMeetingLink(meetingLink) {
  if (!meetingLink) return null;
  const raw = String(meetingLink).trim();
  if (!raw) return null;

  const meetCode = normalizeMeetCode(raw);
  if (meetCode) return `meet:${meetCode}`;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();

    if (host.endsWith('zoom.us')) {
      const meetingId = path.match(/\/(?:j|wc)\/(\d+)/)?.[1];
      if (meetingId) return `zoom:${meetingId}`;
    }

    if (host === 'teams.microsoft.com' || host.endsWith('.teams.microsoft.com') || host === 'teams.live.com') {
      return `teams:${host}${decodeURIComponent(path)}`;
    }

    return `${host}${path}`;
  } catch {
    return raw.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '') || null;
  }
}

function normalizeMeetingTitle(title) {
  return String(title || '')
    .replace(/^meet\s*-\s*/i, '')
    .replace(/\s+(?:[-\u2013\u2014]|\|)\s+(google meet|microsoft teams|teams|zoom(?: workplace)?)$/i, '')
    .replace(/^zoom\s*[-\u2013\u2014]\s*/i, '')
    .replace(/^microsoft teams\s*[-\u2013\u2014]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleVariants(title) {
  const normalized = normalizeMeetingTitle(title);
  if (!normalized) return new Set();

  const variants = new Set([normalized]);
  const withoutTrailingKind = normalized
    .replace(/\b(zoom|teams|google meet)\b/g, '')
    .replace(/\s*\b(meeting|call|webinar|conference|live event)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (withoutTrailingKind && withoutTrailingKind.length >= 4) variants.add(withoutTrailingKind);

  const punctuationFolded = normalized.replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (punctuationFolded) variants.add(punctuationFolded);

  return variants;
}

function isGenericRecordingTitle(title) {
  const normalized = normalizeMeetingTitle(title);
  if (!normalized) return true;
  return new Set([
    'meeting',
    'meeting recording',
    'google meet',
    'google meet recording',
    'zoom',
    'zoom meeting',
    'zoom webinar',
    'teams',
    'teams meeting',
    'microsoft teams',
    'microsoft teams meeting',
  ]).has(normalized);
}

function scoreTitleMatch(uploadTitle, scheduledTitle) {
  if (isGenericRecordingTitle(uploadTitle)) return 0;

  const uploadVariants = titleVariants(uploadTitle);
  const scheduledVariants = titleVariants(scheduledTitle);
  if (!uploadVariants.size || !scheduledVariants.size) return 0;

  for (const variant of uploadVariants) {
    if (scheduledVariants.has(variant)) return 100;
  }

  let best = 0;
  for (const uploadVariant of uploadVariants) {
    for (const scheduledVariant of scheduledVariants) {
      if (uploadVariant.length < 4 || scheduledVariant.length < 4) continue;
      if (uploadVariant.includes(scheduledVariant) || scheduledVariant.includes(uploadVariant)) {
        best = Math.max(best, 85);
      }
      const uploadTokens = new Set(uploadVariant.split(/\s+/).filter((t) => t.length > 2));
      const scheduledTokens = new Set(scheduledVariant.split(/\s+/).filter((t) => t.length > 2));
      const intersection = [...uploadTokens].filter((t) => scheduledTokens.has(t)).length;
      const union = new Set([...uploadTokens, ...scheduledTokens]).size;
      if (union) best = Math.max(best, Math.round((intersection / union) * 100));
    }
  }

  return best >= 70 ? best : 0;
}

async function refreshCurrentUserSchedule(userId) {
  try {
    const currentUser = await User.findByPk(userId, { attributes: ['id', 'google_refresh_token'] });
    if (!currentUser?.google_refresh_token) return;

    const calendarService = require('../services/calendar.service');
    const { getOAuthClient } = require('../config/googleAuth');
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: currentUser.google_refresh_token });
    await calendarService.syncMeetingsForAuth(client, userId);
  } catch (err) {
    logger.warn(`Best-effort calendar refresh before recording match failed: ${err.message}`);
  }
}

async function findMeetingForMeetLink(meetLink, scheduledAt = null) {
  const normalizedLink = normalizeMeetingLink(meetLink);
  if (!normalizedLink) return null;

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : new Date();
  const validDate = !Number.isNaN(scheduledDate.getTime()) ? scheduledDate : new Date();
  const lowerBound = new Date(validDate.getTime() - 12 * 60 * 60 * 1000);
  const upperBound = new Date(validDate.getTime() + 12 * 60 * 60 * 1000);

  const candidates = await Meeting.findAll({
    where: {
      meet_link: { [Op.ne]: null },
      status: { [Op.in]: ['scheduled', 'recording', 'processing'] },
      scheduled_at: { [Op.between]: [lowerBound, upperBound] },
    },
    order: [
      ['status', 'ASC'],
      ['scheduled_at', 'ASC'],
    ],
  });

  const matches = candidates.filter((meeting) => normalizeMeetingLink(meeting.meet_link) === normalizedLink);
  const statusRank = { recording: 0, scheduled: 1, processing: 2 };
  matches.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  return matches[0] || null;
}

async function findMeetingForUpload({ meetLink, title, scheduledAt }) {
  const byMeetLink = await findMeetingForMeetLink(meetLink, scheduledAt);
  if (byMeetLink) return byMeetLink;

  if (isGenericRecordingTitle(title)) return null;

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : new Date();
  const validDate = !Number.isNaN(scheduledDate.getTime()) ? scheduledDate : new Date();
  const lowerBound = new Date(validDate.getTime() - 12 * 60 * 60 * 1000);
  const upperBound = new Date(validDate.getTime() + 12 * 60 * 60 * 1000);

  const candidates = await Meeting.findAll({
    where: {
      status: { [Op.in]: ['scheduled', 'recording', 'processing'] },
      scheduled_at: { [Op.between]: [lowerBound, upperBound] },
    },
  });

  const matches = candidates
    .map((meeting) => ({ meeting, score: scoreTitleMatch(title, meeting.title) }))
    .filter((m) => m.score > 0);
  const statusRank = { recording: 0, scheduled: 1, processing: 2 };
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const linkRank = Number(!b.meeting.meet_link) - Number(!a.meeting.meet_link);
    if (linkRank !== 0) return linkRank;
    const statusDiff = (statusRank[a.meeting.status] ?? 9) - (statusRank[b.meeting.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return Math.abs(new Date(a.meeting.scheduled_at).getTime() - validDate.getTime())
      - Math.abs(new Date(b.meeting.scheduled_at).getTime() - validDate.getTime());
  });

  return matches[0]?.meeting || null;
}

function parseAttendeePayload(body) {
  const attendees = [];

  if (body.attendees) {
    const raw = typeof body.attendees === 'string'
      ? (() => { try { return JSON.parse(body.attendees); } catch { return []; } })()
      : body.attendees;
    if (Array.isArray(raw)) attendees.push(...raw);
  }

  if (body.attendee_emails) {
    const emails = Array.isArray(body.attendee_emails)
      ? body.attendee_emails
      : String(body.attendee_emails).split(',');
    attendees.push(...emails.map((email) => ({ email })));
  }

  const seen = new Set();
  return attendees
    .map((a) => ({
      email: String(a.email || '').trim().toLowerCase() || null,
      name: String(a.name || a.displayName || '').trim() || null,
      status: a.status === 'absent' ? 'absent' : 'present',
    }))
    .filter((a) => a.email || a.name)
    .filter((a) => {
      const key = a.email || `name:${a.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function upsertAttendeesForMeeting(meetingId, attendees) {
  for (const attendee of attendees) {
    const user = attendee.email ? await User.findOne({ where: { email: attendee.email } }) : null;
    const where = attendee.email
      ? { meeting_id: meetingId, email: attendee.email }
      : { meeting_id: meetingId, name: attendee.name };
    const existing = await MeetingAttendee.findOne({ where });

    if (existing) {
      await existing.update({
        name: attendee.name || existing.name || user?.name || null,
        user_id: user?.id || existing.user_id || null,
        status: attendee.status,
      });
    } else {
      await MeetingAttendee.create({
        meeting_id: meetingId,
        email: attendee.email,
        name: attendee.name || user?.name || null,
        user_id: user?.id || null,
        status: attendee.status,
      });
    }
  }
}

async function listMeetings(req, res, next) {
  try {
    const { status, from, to, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.scheduled_at = {};
      if (from) where.scheduled_at[Op.gte] = new Date(from);
      if (to) where.scheduled_at[Op.lte] = new Date(to);
    }

    // All users (including admin) only see their own meetings
    const ids = await accessibleMeetingIds(req.user.id);
    where.id = ids.length ? { [Op.in]: ids } : { [Op.in]: [-1] };

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Meeting.findAndCountAll({
      where,
      include: [
        { model: User, as: 'organizer', attributes: ['id', 'name', 'email'] },
      ],
      order: [['scheduled_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      meetings: rows,
    });
  } catch (err) {
    next(err);
  }
}

async function getMeeting(req, res, next) {
  try {
    const level = await getMeetingAccessLevel(req.user, req.params.id);
    if (level === 'none') return res.status(403).json({ error: 'Access denied' });

    const meeting = await Meeting.findByPk(req.params.id, {
      include: [
        { model: User, as: 'organizer', attributes: ['id', 'name', 'email'] },
        {
          model: MeetingAttendee,
          as: 'attendees',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        },
        {
          model: MOM,
          as: 'mom',
          include: [
            { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
            { model: Task, as: 'tasks', order: [['created_at', 'ASC']] },
          ],
        },
      ],
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json(meeting);
  } catch (err) {
    next(err);
  }
}

async function syncCalendar(req, res, next) {
  try {
    const calendarService = require('../services/calendar.service');
    const { getOAuthClient } = require('../config/googleAuth');

    // Sync only the current user's own calendar if they've connected Google
    const currentUser = await User.findByPk(req.user.id, { attributes: ['id', 'google_refresh_token'] });
    let results;
    if (currentUser?.google_refresh_token) {
      const client = getOAuthClient();
      client.setCredentials({ refresh_token: currentUser.google_refresh_token });
      results = await calendarService.syncMeetingsForAuth(client, req.user.id);
    } else {
      // Fallback to shared token
      results = await calendarService.syncMeetings();
    }

    const created = results.filter((r) => r.created).length;
    const updated = results.length - created;

    res.json({
      message: 'Calendar sync complete',
      created,
      updated,
      total: results.length,
      meetings: results.map((r) => ({
        id: r.meeting.id,
        title: r.meeting.title,
        scheduled_at: r.meeting.scheduled_at,
        status: r.meeting.status,
        created: r.created,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function updateMeetingStatus(req, res, next) {
  try {
    const { status } = req.body;
    const valid = ['scheduled', 'recording', 'processing', 'completed', 'failed'];

    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    await meeting.update({ status });
    res.json(meeting);
  } catch (err) {
    next(err);
  }
}

async function deleteMeeting(req, res, next) {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    await meeting.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}


async function createMeeting(req, res, next) {
  try {
    const { title, scheduled_at, meet_link, location } = req.body;
    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }

    // organizer_id defaults to current user unless explicitly passed as null
    const organizerId = req.body.organizer_id !== undefined
      ? req.body.organizer_id
      : req.user.id;

    const meeting = await Meeting.create({
      title,
      scheduled_at: new Date(scheduled_at),
      meet_link: meet_link || null,
      location: location || null,
      created_by: req.user.id,
      organizer_id: organizerId,
      status: 'scheduled',
    });

    await upsertAttendeesForMeeting(meeting.id, parseAttendeePayload(req.body));

    const full = await Meeting.findByPk(meeting.id, {
      include: [{ model: User, as: 'organizer', attributes: ['id', 'name', 'email'] }],
    });

    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
}

async function startExtensionRecording(req, res, next) {
  try {
    const { title, scheduled_at, meet_link, platform } = req.body;
    if (!meet_link && !title) {
      return res.status(400).json({ error: 'meet_link or title is required' });
    }

    const scheduledAt = scheduled_at || new Date().toISOString();
    await refreshCurrentUserSchedule(req.user.id);
    let meeting = await findMeetingForUpload({ meetLink: meet_link, title, scheduledAt });

    if (meeting) {
      if (meeting.status === 'scheduled') {
        await meeting.update({
          status: 'recording',
          started_at: meeting.started_at || new Date(),
          location: platform || meeting.location,
        });
      }
      logger.info(`Extension recording attached to meeting ${meeting.id}: "${meeting.title}"`);
    } else {
      meeting = await Meeting.create({
        title: title || 'Google Meet Recording',
        scheduled_at: new Date(scheduledAt),
        meet_link: meet_link || null,
        location: platform || null,
        created_by: req.user.id,
        organizer_id: req.user.id,
        status: 'recording',
        started_at: new Date(),
      });
      logger.info(`Extension recording created meeting ${meeting.id}: "${meeting.title}"`);
    }

    await upsertAttendeesForMeeting(meeting.id, parseAttendeePayload(req.body));

    res.status(200).json({ ok: true, meeting });
  } catch (err) {
    next(err);
  }
}

async function uploadMeeting(req, res, next) {
  try {
    const { title, scheduled_at, location, meet_link } = req.body;
    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Meeting recording file is required' });
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    const platform   = req.body.platform || 'Unknown';
    logger.info(`━━━ AI PIPELINE START ━━━ "${title}" [${platform}] — ${fileSizeMB} MB`);

    await refreshCurrentUserSchedule(req.user.id);
    let meeting = await findMeetingForUpload({ meetLink: meet_link, title, scheduledAt: scheduled_at });

    if (meeting) {
      const update = {
        location: location || meeting.location,
        meet_link: meet_link || meeting.meet_link,
        status: 'processing',
        ended_at: new Date(),
      };
      if (!meeting.google_event_id && title) update.title = title;
      if (!meeting.started_at) update.started_at = new Date(scheduled_at);
      if (meeting.started_at) {
        update.duration_seconds = Math.max(
          0,
          Math.round((Date.now() - new Date(meeting.started_at).getTime()) / 1000),
        );
      }
      await meeting.update(update);
      logger.info(`[Pipeline] Matched existing meeting #${meeting.id}: "${meeting.title}"`);
    } else {
      meeting = await Meeting.create({
        title,
        scheduled_at: new Date(scheduled_at),
        meet_link:    meet_link  || null,
        location:     location   || null,
        created_by:   req.user.id,
        organizer_id: req.user.id,
        status:       'processing',
        started_at:   new Date(scheduled_at),
        ended_at:     new Date(),
      });
      logger.info(`[Pipeline] Created new meeting #${meeting.id}: "${meeting.title}"`);
    }

    await upsertAttendeesForMeeting(meeting.id, parseAttendeePayload(req.body));

    // Step 1 — Convert to MP3 if needed
    const nodePath   = require('path');
    const uploadedPath = req.file.path;
    const ext = nodePath.extname(req.file.originalname).toLowerCase();
    let audioPath = uploadedPath;

    if (ext !== '.mp3') {
      const mp3Path = uploadedPath + '.mp3';
      logger.info(`[Pipeline] [1/4] FFmpeg: converting ${ext} → MP3 (${fileSizeMB} MB input)…`);
      const t1 = Date.now();
      try {
        const ffmpegService = require('../services/ffmpeg.service');
        audioPath = await ffmpegService.convertVideoToAudio(uploadedPath, mp3Path);
        const mp3MB = (require('fs').statSync(audioPath).size / 1024 / 1024).toFixed(1);
        logger.info(`[Pipeline] [1/4] FFmpeg: done → ${mp3MB} MB MP3 in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
      } catch (convErr) {
        logger.warn(`[Pipeline] [1/4] FFmpeg: conversion failed — using original file (${convErr.message})`);
        audioPath = uploadedPath;
      }
    } else {
      logger.info(`[Pipeline] [1/4] FFmpeg: skipped — file is already MP3`);
    }

    await meeting.update({ audio_path: audioPath });

    // Steps 2–4 — Async MOM generation (Whisper → Claude → DB)
    const claudeService = require('../services/claude.service');
    claudeService.generateMOM(meeting.id, audioPath)
      .then(() => logger.info(`━━━ AI PIPELINE DONE ━━━ meeting #${meeting.id} → completed ✓`))
      .catch(async (err) => {
        logger.error(`━━━ AI PIPELINE FAILED ━━━ meeting #${meeting.id}: ${describeError(err)}`);
        await meeting.update({ status: 'failed' }).catch(() => {});
      });

    const full = await Meeting.findByPk(meeting.id, {
      include: [{ model: User, as: 'organizer', attributes: ['id', 'name', 'email'] }],
    });

    res.status(201).json({ ok: true, meeting: full });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /meetings/:id/info
 * Update host (organizer) and attendees list from the MOM editor.
 */
async function updateMeetingInfo(req, res, next) {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const { organizer_name, organizer_email, attendees } = req.body;

    // Resolve organizer_id from email if possible
    let organizerId = meeting.organizer_id;
    if (organizer_email) {
      const orgUser = await User.findOne({ where: { email: organizer_email } });
      if (orgUser) organizerId = orgUser.id;
    }

    await meeting.update({
      organizer_name:  organizer_name  ?? meeting.organizer_name,
      organizer_email: organizer_email ?? meeting.organizer_email,
      organizer_id:    organizerId,
    });

    // Replace attendees if provided
    if (Array.isArray(attendees)) {
      await MeetingAttendee.destroy({ where: { meeting_id: meeting.id } });
      for (const a of attendees) {
        const email = a.email?.trim() || null;
        const name  = a.name?.trim()  || null;
        if (!email && !name) continue; // skip completely empty rows
        const user = email ? await User.findOne({ where: { email } }) : null;
        await MeetingAttendee.create({
          meeting_id: meeting.id,
          email,
          name:    name || user?.name || null,
          user_id: user?.id || null,
          status:  a.status === 'absent' ? 'absent' : 'present',
        });
      }
    }

    const updated = await Meeting.findByPk(meeting.id, {
      include: [
        { model: User, as: 'organizer', attributes: ['id', 'name', 'email'] },
        {
          model: MeetingAttendee,
          as: 'attendees',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        },
      ],
    });

    res.json({ ok: true, meeting: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /meetings/calendar-events?from=<ISO>&to=<ISO>
 * Returns raw Google Calendar events for the given date range.
 */
async function getCalendarEvents(req, res, next) {
  try {
    const { from, to } = req.query;
    const timeMin = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = to   || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // Use the logged-in user's own Google refresh token
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'google_refresh_token'] });
    if (!user?.google_refresh_token) {
      return res.json({ events: [], connected: false });
    }

    const { fetchCalendarEventsForRange } = require('../services/calendar.service');
    const events = await fetchCalendarEventsForRange(timeMin, timeMax, user.google_refresh_token);
    res.json({ events, connected: true });
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.code === 401) {
      return res.json({ events: [], connected: false, error: 'Google token expired — please reconnect' });
    }
    next(err);
  }
}

async function updateAttendee(req, res, next) {
  try {
    const attendee = await MeetingAttendee.findOne({
      where: { id: req.params.attendeeId, meeting_id: req.params.id },
    });
    if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
    const { name } = req.body;
    if (typeof name === 'string') await attendee.update({ name: name.trim() || null });
    res.json({ ok: true, attendee });
  } catch (err) {
    next(err);
  }
}

async function retryPipeline(req, res, next) {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.audio_path) return res.status(422).json({ error: 'No audio file for this meeting' });

    await meeting.update({ status: 'processing' });
    require('../services/claude.service')
      .generateMOM(meeting.id, meeting.audio_path)
      .catch((err) => {
        logger.error(`Retry pipeline failed for meeting ${meeting.id}: ${describeError(err)}`);
        meeting.update({ status: 'failed' }).catch(() => {});
      });

    res.json({ message: 'Pipeline restarted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMeetings, getMeeting, createMeeting, startExtensionRecording, uploadMeeting, syncCalendar, updateMeetingStatus, deleteMeeting, updateMeetingInfo, getCalendarEvents, retryPipeline, updateAttendee };
