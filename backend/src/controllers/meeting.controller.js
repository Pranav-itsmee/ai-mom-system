const { Op } = require('sequelize');
const { Meeting, User, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../models');

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
    const results = await calendarService.syncMeetings();

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

/**
 * POST /meetings/:id/admit
 * Authorised users trigger this to admit participants waiting in the bot's lobby.
 * The bot never auto-admits — this is the only code path that calls admitWaiting().
 */
async function admitWaiting(req, res, next) {
  try {
    const meetBot = require('../bot/meetBot');
    const admitted = await meetBot.admitWaiting(parseInt(req.params.id, 10));
    res.json({ admitted, count: admitted.length });
  } catch (err) {
    // 404-style error if no active session
    if (err.message.includes('No active bot session')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * GET /meetings/:id/waiting
 * Returns the current count of participants waiting in the lobby.
 */
async function getWaiting(req, res, next) {
  try {
    const meetBot = require('../bot/meetBot');
    const count = meetBot.getWaitingCount(parseInt(req.params.id, 10));
    res.json({ meeting_id: parseInt(req.params.id, 10), waiting: count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /meetings/:id/record
 * Immediately start the bot for a meeting that is already created.
 */
async function startRecording(req, res, next) {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.meet_link) return res.status(422).json({ error: 'Meeting has no meet_link' });

    const meetBot = require('../bot/meetBot');
    // Fire-and-forget — bot joins asynchronously
    meetBot.joinMeeting(meeting).catch((err) => {
      require('../utils/logger').error(`Bot failed for meeting ${meeting.id}: ${err.message}`);
      meeting.update({ status: 'failed' });
    });

    await meeting.update({ status: 'recording' });
    res.json({ ok: true, message: 'Bot is joining the meeting…', meeting_id: meeting.id });
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

async function uploadMeeting(req, res, next) {
  try {
    const { title, scheduled_at, location, meet_link, attendee_emails } = req.body;
    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Meeting recording file is required' });
    }

    const meeting = await Meeting.create({
      title,
      scheduled_at: new Date(scheduled_at),
      meet_link:    meet_link  || null,
      location:     location   || null,
      created_by:   req.user.id,
      organizer_id: req.user.id,
      status:       'processing',
    });

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

    // Convert to MP3 if not already
    const nodePath  = require('path');
    const uploadedPath = req.file.path;
    const ext = nodePath.extname(req.file.originalname).toLowerCase();
    let audioPath = uploadedPath;

    if (ext !== '.mp3') {
      const mp3Path = uploadedPath + '.mp3';
      try {
        const ffmpegService = require('../services/ffmpeg.service');
        audioPath = await ffmpegService.convertVideoToAudio(uploadedPath, mp3Path);
      } catch (convErr) {
        require('../utils/logger').warn(`FFmpeg conversion skipped, using original: ${convErr.message}`);
        audioPath = uploadedPath;
      }
    }

    await meeting.update({ audio_path: audioPath });

    // Async MOM generation — don't await
    const claudeService = require('../services/claude.service');
    const logger        = require('../utils/logger');
    claudeService.generateMOM(meeting.id, audioPath)
      .then(() => logger.info(`Upload MOM generated for meeting ${meeting.id}`))
      .catch(async (err) => {
        logger.error(`Upload MOM generation failed for meeting ${meeting.id}: ${err.message}`);
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

module.exports = { listMeetings, getMeeting, createMeeting, uploadMeeting, syncCalendar, updateMeetingStatus, deleteMeeting, admitWaiting, getWaiting, startRecording, updateMeetingInfo };
