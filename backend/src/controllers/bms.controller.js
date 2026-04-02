const axios = require('axios');
const { MeetingProjectLink, Meeting, User } = require('../models');
const logger = require('../utils/logger');

/**
 * Return the list of available BMS projects for the "Link to Project" dropdown.
 *
 * Strategy (per CLAUDE.md Section 13):
 *   - BMS_API_URL set  → proxy request to the external BMS service
 *   - BMS_API_URL unset → return an empty list with an info message
 */
async function getProjects(req, res, next) {
  try {
    const bmsUrl = process.env.BMS_API_URL;

    if (bmsUrl) {
      const response = await axios.get(`${bmsUrl}/projects`, {
        headers: { Authorization: req.headers.authorization },
        timeout: 8000,
      });
      return res.json(response.data);
    }

    // BMS not configured — return empty list so UI degrades gracefully
    res.json({
      projects: [],
      message: 'BMS integration not configured. Set BMS_API_URL in .env.',
    });
  } catch (err) {
    logger.error(`BMS getProjects error: ${err.message}`);
    next(err);
  }
}

/**
 * Link a meeting to a BMS project.
 * POST /bms/link  { meeting_id, project_id }
 */
async function linkMeetingToProject(req, res, next) {
  try {
    const { meeting_id, project_id } = req.body;

    if (!meeting_id || !project_id) {
      return res.status(400).json({ error: 'meeting_id and project_id are required' });
    }

    const meeting = await Meeting.findByPk(meeting_id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Prevent duplicate links
    const existing = await MeetingProjectLink.findOne({
      where: { meeting_id, project_id },
    });
    if (existing) {
      return res.status(409).json({ error: 'This meeting is already linked to that project' });
    }

    const link = await MeetingProjectLink.create({
      meeting_id,
      project_id,
      linked_by: req.user.id,
    });

    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
}

/**
 * Return all project links for a given meeting.
 * GET /bms/links/:meetingId
 */
async function getLinksForMeeting(req, res, next) {
  try {
    const links = await MeetingProjectLink.findAll({
      where: { meeting_id: req.params.meetingId },
      include: [{ model: User, as: 'linkedByUser', attributes: ['id', 'name'] }],
      order: [['linked_at', 'DESC']],
    });
    res.json(links);
  } catch (err) {
    next(err);
  }
}

/**
 * Remove a project link by its own id.
 * DELETE /bms/link/:id
 */
async function removeLink(req, res, next) {
  try {
    const link = await MeetingProjectLink.findByPk(req.params.id);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    await link.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getProjects, linkMeetingToProject, getLinksForMeeting, removeLink };
