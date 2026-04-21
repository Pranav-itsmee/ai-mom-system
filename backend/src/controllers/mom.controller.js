const { Op } = require('sequelize');
const {
  MOM, MOMKeyPoint, MOMVersion, Meeting, Task, User, MeetingAttendee,
} = require('../models');
const { getMeetingAccessLevel, accessibleMeetingIds } = require('../utils/meetingAccess');

// ── Full meeting include (organizer + attendees) ───────────────────────────
function meetingInclude() {
  return {
    model: Meeting,
    as:    'meeting',
    attributes: [
      'id', 'title', 'scheduled_at', 'status',
      'location', 'meet_link', 'duration_seconds',
      'organizer_id', 'organizer_name', 'organizer_email',
    ],
    include: [
      { model: User, as: 'organizer', attributes: ['id', 'name', 'email'] },
      {
        model: MeetingAttendee,
        as: 'attendees',
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      },
    ],
  };
}

// ── Build Task include, optionally scoped to one assignee ─────────────────
function taskInclude(assigneeIdFilter = null) {
  return {
    model: Task,
    as: 'tasks',
    separate: true,
    order: [['created_at', 'ASC']],
    ...(assigneeIdFilter ? { where: { assignee_id: assigneeIdFilter } } : {}),
    include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
  };
}

/** GET /mom/id/:id — fetch by MOM primary key */
async function getMOMById(req, res, next) {
  try {
    // Fetch without tasks first so we can gate on access level
    const mom = await MOM.findByPk(req.params.id, {
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', separate: true, order: [['order_index', 'ASC']] },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
        meetingInclude(),
      ],
    });
    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    const level = await getMeetingAccessLevel(req.user, mom.meeting_id);
    if (level === 'none') return res.status(403).json({ error: 'Access denied' });

    // task_only users only see their own tasks
    const tasksFilter = level === 'task_only' ? req.user.id : null;
    const tasks = await Task.findAll({
      where: { mom_id: mom.id, ...(tasksFilter ? { assignee_id: tasksFilter } : {}) },
      order: [['created_at', 'ASC']],
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
    });

    res.json({ ...mom.toJSON(), tasks });
  } catch (err) {
    next(err);
  }
}

/** GET /mom/:meetingId — fetch by meeting ID */
async function getMOMByMeeting(req, res, next) {
  try {
    const level = await getMeetingAccessLevel(req.user, req.params.meetingId);
    if (level === 'none') return res.status(403).json({ error: 'Access denied' });

    const mom = await MOM.findOne({
      where: { meeting_id: req.params.meetingId },
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', separate: true, order: [['order_index', 'ASC']] },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
        meetingInclude(),
      ],
    });

    if (!mom) return res.status(404).json({ error: 'MOM not found for this meeting' });

    // task_only users only see their own tasks
    const tasksFilter = level === 'task_only' ? req.user.id : null;
    const tasks = await Task.findAll({
      where: { mom_id: mom.id, ...(tasksFilter ? { assignee_id: tasksFilter } : {}) },
      order: [['created_at', 'ASC']],
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
    });

    res.json({ ...mom.toJSON(), tasks });
  } catch (err) {
    next(err);
  }
}

/** GET /mom/list — user-scoped MOM list */
async function listMOMs(req, res, next) {
  try {
    const archived = req.query.archived === 'true';
    const where = { is_archived: archived };

    if (req.user.role !== 'admin') {
      const ids = await accessibleMeetingIds(req.user.id);
      where.meeting_id = ids.length ? { [Op.in]: ids } : { [Op.in]: [-1] };
    }

    const moms = await MOM.findAll({
      where,
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'scheduled_at', 'status'],
          include: [{ model: User, as: 'organizer', attributes: ['id', 'name'] }],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 200,
    });

    res.json({ total: moms.length, moms });
  } catch (err) {
    next(err);
  }
}

/** PATCH /mom/:id/archive — toggle archive state */
async function archiveMOM(req, res, next) {
  try {
    const mom = await MOM.findByPk(req.params.id);
    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    const nowArchived = !mom.is_archived;
    await mom.update({
      is_archived: nowArchived,
      archived_at: nowArchived ? new Date() : null,
    });

    res.json({ ok: true, is_archived: nowArchived });
  } catch (err) {
    next(err);
  }
}

/** PUT /mom/:id — update MOM, archiving the prior version first */
async function updateMOM(req, res, next) {
  try {
    const { summary, key_points } = req.body;

    if (!summary && !key_points) {
      return res.status(400).json({ error: 'Provide summary or key_points to update' });
    }

    const mom = await MOM.findByPk(req.params.id, {
      include: [{ model: MOMKeyPoint, as: 'keyPoints', separate: true, order: [['order_index', 'ASC']] }],
    });
    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    // Archive current version before overwriting
    await MOMVersion.create({
      mom_id:          mom.id,
      summary:         mom.summary,
      key_points_json: JSON.stringify((mom.keyPoints ?? []).map((kp) => kp.point_text)),
      archived_by:     req.user.id,
      archived_at:     new Date(),
    });

    const updates = {
      is_edited: true,
      edited_by: req.user.id,
      edited_at: new Date(),
    };
    if (summary !== undefined) updates.summary = summary;

    await mom.update(updates);

    if (Array.isArray(key_points)) {
      await MOMKeyPoint.destroy({ where: { mom_id: mom.id } });
      if (key_points.length > 0) {
        await MOMKeyPoint.bulkCreate(
          key_points.map((text, idx) => ({
            mom_id:      mom.id,
            point_text:  text,
            order_index: idx,
          }))
        );
      }
    }

    const updated = await MOM.findByPk(mom.id, {
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', separate: true, order: [['order_index', 'ASC']] },
        {
          model: Task,
          as: 'tasks',
          separate: true,
          order: [['created_at', 'ASC']],
          include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
        },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
        meetingInclude(),
      ],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** GET /mom/:id/versions — list archived versions */
async function getMOMVersions(req, res, next) {
  try {
    const versions = await MOMVersion.findAll({
      where: { mom_id: req.params.id },
      include: [{ model: User, as: 'archivedByUser', attributes: ['id', 'name'] }],
      order: [['archived_at', 'DESC']],
    });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
}

async function regenerateMOM(req, res, next) {
  try {
    const mom = await MOM.findByPk(req.params.id, {
      include: [{ model: Meeting, as: 'meeting' }],
    });

    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    const meeting = mom.meeting;  // lowercase: alias is 'meeting'

    if (!meeting.audio_path) {
      return res.status(422).json({
        error: 'No audio file associated with this meeting — cannot regenerate MOM',
      });
    }

    const fs = require('fs');
    if (!fs.existsSync(meeting.audio_path)) {
      return res.status(422).json({
        error: `Audio file not found on server: ${meeting.audio_path}`,
      });
    }

    await meeting.update({ status: 'processing' });

    const claudeService = require('../services/claude.service');
    claudeService
      .generateMOM(meeting.id, meeting.audio_path)
      .then(() => require('../utils/logger').info(`MOM regenerated for meeting ${meeting.id}`))
      .catch((err) => {
        require('../utils/logger').error(`MOM regeneration failed for meeting ${meeting.id}: ${err.message}`);
        meeting.update({ status: 'failed' }).catch(() => {});
      });

    res.json({
      message: 'MOM regeneration started. The updated MOM will be available shortly.',
      meeting_id: meeting.id,
      mom_id:     mom.id,
    });
  } catch (err) {
    next(err);
  }
}

async function searchMOMs(req, res, next) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const where = {
      [Op.or]: [
        { summary:        { [Op.like]: `%${q}%` } },
        { raw_transcript: { [Op.like]: `%${q}%` } },
      ],
    };

    if (req.user.role !== 'admin') {
      const ids = await accessibleMeetingIds(req.user.id);
      where.meeting_id = ids.length ? { [Op.in]: ids } : { [Op.in]: [-1] };
    }

    const results = await MOM.findAll({
      where,
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'scheduled_at', 'status'],
          include: [{ model: User, as: 'organizer', attributes: ['id', 'name'] }],
        },
        { model: MOMKeyPoint, as: 'keyPoints', separate: true, order: [['order_index', 'ASC']] },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json({ query: q, total: results.length, results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMOMById,
  getMOMByMeeting,
  listMOMs,
  updateMOM,
  getMOMVersions,
  regenerateMOM,
  searchMOMs,
  archiveMOM,
};
