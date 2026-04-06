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
          include: [{ model: User, attributes: ['id', 'name', 'email'] }],
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

module.exports = { listMeetings, getMeeting, syncCalendar, updateMeetingStatus, deleteMeeting, admitWaiting, getWaiting };
