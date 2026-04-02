const { Op } = require('sequelize');
const { MOM, MOMKeyPoint, Meeting, Task, User } = require('../models');

/** Fetch a MOM by its own primary key (used by the edit page). */
async function getMOMById(req, res, next) {
  try {
    const mom = await MOM.findByPk(req.params.id, {
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
        { model: Task, as: 'tasks', order: [['created_at', 'ASC']] },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
        { model: Meeting, attributes: ['id', 'title', 'scheduled_at', 'status'] },
      ],
    });
    if (!mom) return res.status(404).json({ error: 'MOM not found' });
    res.json(mom);
  } catch (err) {
    next(err);
  }
}

async function getMOMByMeeting(req, res, next) {
  try {
    const mom = await MOM.findOne({
      where: { meeting_id: req.params.meetingId },
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
        { model: Task, as: 'tasks', order: [['created_at', 'ASC']] },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!mom) {
      return res.status(404).json({ error: 'MOM not found for this meeting' });
    }

    res.json(mom);
  } catch (err) {
    next(err);
  }
}

async function updateMOM(req, res, next) {
  try {
    const { summary, key_points } = req.body;

    if (!summary && !key_points) {
      return res.status(400).json({ error: 'Provide summary or key_points to update' });
    }

    const mom = await MOM.findByPk(req.params.id);
    if (!mom) {
      return res.status(404).json({ error: 'MOM not found' });
    }

    const updates = {
      is_edited: true,
      edited_by: req.user.id,
      edited_at: new Date(),
    };
    if (summary) updates.summary = summary;

    await mom.update(updates);

    if (Array.isArray(key_points)) {
      // Replace all key points for this MOM
      await MOMKeyPoint.destroy({ where: { mom_id: mom.id } });

      if (key_points.length > 0) {
        await MOMKeyPoint.bulkCreate(
          key_points.map((text, idx) => ({
            mom_id: mom.id,
            point_text: text,
            order_index: idx,
          }))
        );
      }
    }

    // Return updated MOM with key points
    const updated = await MOM.findByPk(mom.id, {
      include: [
        { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
        { model: Task, as: 'tasks', order: [['created_at', 'ASC']] },
        { model: User, as: 'editor', attributes: ['id', 'name', 'email'] },
      ],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function regenerateMOM(req, res, next) {
  try {
    // req.params.id is the MOM id
    const mom = await MOM.findByPk(req.params.id, {
      include: [{ model: Meeting }],
    });

    if (!mom) {
      return res.status(404).json({ error: 'MOM not found' });
    }

    const meeting = mom.Meeting;

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

    // Set status to processing so the UI reflects in-progress state
    await meeting.update({ status: 'processing' });

    // Run regeneration asynchronously — respond immediately so the request doesn't hang
    const claudeService = require('../services/claude.service');
    claudeService
      .generateMOM(meeting.id, meeting.audio_path)
      .then(() => {
        require('../utils/logger').info(`MOM regenerated for meeting ${meeting.id}`);
      })
      .catch((err) => {
        require('../utils/logger').error(
          `MOM regeneration failed for meeting ${meeting.id}: ${err.message}`
        );
        meeting.update({ status: 'failed' }).catch(() => {});
      });

    res.json({
      message: 'MOM regeneration started. The updated MOM will be available shortly.',
      meeting_id: meeting.id,
      mom_id: mom.id,
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

    const results = await MOM.findAll({
      where: {
        [Op.or]: [
          { summary: { [Op.like]: `%${q}%` } },
          { raw_transcript: { [Op.like]: `%${q}%` } },
        ],
      },
      include: [
        { model: Meeting, attributes: ['id', 'title', 'scheduled_at', 'status'] },
        { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json({ query: q, total: results.length, results });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMOMById, getMOMByMeeting, updateMOM, regenerateMOM, searchMOMs };
