const { Op } = require('sequelize');
const { Meeting, User, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../models');
const logger = require('../utils/logger');
const { getMeetingAccessLevel, accessibleMeetingIds } = require('../utils/meetingAccess');

function normalizeMeetCode(meetLink) {
  if (!meetLink) return null;
  const match = String(meetLink).match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return match?.[1]?.toLowerCase() || null;
}

function normalizeMeetingTitle(title) {
  return String(title || '')
    .replace(/^meet\s*-\s*/i, '')
    .trim()
    .toLowerCase();
}

async function findMeetingForMeetLink(meetLink, scheduledAt = null) {
  const meetCode = normalizeMeetCode(meetLink);
  if (!meetCode) return null;

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

  const matches = candidates.filter((meeting) => normalizeMeetCode(meeting.meet_link) === meetCode);
  const statusRank = { recording: 0, scheduled: 1, processing: 2 };
  matches.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  return matches[0] || null;
}

async function findMeetingForUpload({ meetLink, title, scheduledAt }) {
  const byMeetLink = await findMeetingForMeetLink(meetLink, scheduledAt);
  if (byMeetLink) return byMeetLink;

  const normalizedTitle = normalizeMeetingTitle(title);
  if (!normalizedTitle) return null;

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

  const matches = candidates.filter((meeting) => (
    normalizeMeetingTitle(meeting.title) === normalizedTitle
  ));
  const statusRank = { recording: 0, scheduled: 1, processing: 2 };
  matches.sort((a, b) => {
    const linkRank = Number(!b.meet_link) - Number(!a.meet_link);
    if (linkRank !== 0) return linkRank;
    return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
  });

  return matches[0] || null;
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

    // Non-admins only see meetings they are part of (attendee, organiser, creator, or task-assigned)
    if (req.user.role !== 'admin') {
      const ids = await accessibleMeetingIds(req.user.id);
      where.id = ids.length ? { [Op.in]: ids } : { [Op.in]: [-1] };
    }

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
    const { title, scheduled_at, meet_link, location, attendee_emails } = req.body;
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

    // Register attendees by email if provided
    if (Array.isArray(attendee_emails) && attendee_emails.length) {
      const users = await User.findAll({ where: { email: attendee_emails } });
      const MeetingAttendee = require('../models/MeetingAttendee');
      await Promise.all(
        users.map((u) => MeetingAttendee.create({ meeting_id: meeting.id, user_id: u.id }))
      );
    }

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
    const { title, scheduled_at, meet_link } = req.body;
    if (!meet_link && !title) {
      return res.status(400).json({ error: 'meet_link or title is required' });
    }

    const scheduledAt = scheduled_at || new Date().toISOString();
    let meeting = await findMeetingForUpload({ meetLink: meet_link, title, scheduledAt });

    if (meeting) {
      if (meeting.status === 'scheduled') {
        await meeting.update({
          status: 'recording',
          started_at: meeting.started_at || new Date(),
        });
      }
      logger.info(`Extension recording attached to meeting ${meeting.id}: "${meeting.title}"`);
    } else {
      meeting = await Meeting.create({
        title: title || 'Google Meet Recording',
        scheduled_at: new Date(scheduledAt),
        meet_link: meet_link || null,
        created_by: req.user.id,
        organizer_id: req.user.id,
        status: 'recording',
        started_at: new Date(),
      });
      logger.info(`Extension recording created meeting ${meeting.id}: "${meeting.title}"`);
    }

    res.status(200).json({ ok: true, meeting });
  } catch (err) {
    next(err);
  }
}

async function uploadMeeting(req, res, next) {
  try {
    const { title, scheduled_at, location, meet_link, attendee_emails } = req.body;
    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Meeting recording file is required' });
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    const platform   = req.body.platform || 'Unknown';
    logger.info(`━━━ AI PIPELINE START ━━━ "${title}" [${platform}] — ${fileSizeMB} MB`);

    let meeting = await findMeetingForUpload({ meetLink: meet_link, title, scheduledAt: scheduled_at });

    if (meeting) {
      const update = {
        title: title || meeting.title,
        location: location || meeting.location,
        meet_link: meet_link || meeting.meet_link,
        status: 'processing',
        ended_at: new Date(),
      };
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

    if (attendee_emails) {
      const emails = String(attendee_emails).split(',').map((e) => e.trim()).filter(Boolean);
      if (emails.length) {
        const users = await User.findAll({ where: { email: emails } });
        const AttendeeModel = require('../models/MeetingAttendee');
        await Promise.all(users.map((u) =>
          AttendeeModel.create({ meeting_id: meeting.id, user_id: u.id }),
        ));
      }
    }

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
        logger.error(`━━━ AI PIPELINE FAILED ━━━ meeting #${meeting.id}: ${err.message}`);
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

module.exports = { listMeetings, getMeeting, createMeeting, startExtensionRecording, uploadMeeting, syncCalendar, updateMeetingStatus, deleteMeeting, updateMeetingInfo, getCalendarEvents };
