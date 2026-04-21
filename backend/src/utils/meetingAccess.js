const { Op } = require('sequelize');
const { Meeting, MeetingAttendee, Task, MOM } = require('../models');

/**
 * Determine how much access a user has to a specific meeting.
 *
 * Returns:
 *   'admin'      — user is admin, sees everything
 *   'attendee'   — user is an attendee / organizer / creator; sees all tasks
 *   'task_only'  — user has a task assigned from this meeting but is not an attendee;
 *                  sees MOM content but only their own tasks
 *   'none'       — no access
 */
async function getMeetingAccessLevel(user, meetingId) {
  if (user.role === 'admin') return 'admin';

  const id = parseInt(meetingId, 10);

  const [ownedMeeting, attendeeRow] = await Promise.all([
    Meeting.findOne({
      where: { id, [Op.or]: [{ organizer_id: user.id }, { created_by: user.id }] },
      attributes: ['id'],
    }),
    MeetingAttendee.findOne({
      where: { meeting_id: id, user_id: user.id },
      attributes: ['id'],
    }),
  ]);

  if (ownedMeeting || attendeeRow) return 'attendee';

  // Check if user has a task assigned from this meeting's MOM
  const mom = await MOM.findOne({ where: { meeting_id: id }, attributes: ['id'] });
  if (mom) {
    const task = await Task.findOne({
      where: { mom_id: mom.id, assignee_id: user.id },
      attributes: ['id'],
    });
    if (task) return 'task_only';
  }

  return 'none';
}

/**
 * All meeting IDs a non-admin user can access:
 *   - meetings they organised or created
 *   - meetings they attended
 *   - meetings where they have a task assigned
 */
async function accessibleMeetingIds(userId) {
  const [attended, owned, taskMeetings] = await Promise.all([
    MeetingAttendee.findAll({ where: { user_id: userId }, attributes: ['meeting_id'] }),
    Meeting.findAll({
      where: { [Op.or]: [{ organizer_id: userId }, { created_by: userId }] },
      attributes: ['id'],
    }),
    MOM.findAll({
      attributes: ['meeting_id'],
      include: [{
        model: Task,
        as: 'tasks',
        where: { assignee_id: userId },
        attributes: [],
        required: true,
      }],
    }),
  ]);

  return [
    ...new Set([
      ...attended.map((a) => a.meeting_id),
      ...owned.map((m) => m.id),
      ...taskMeetings.map((m) => m.meeting_id),
    ]),
  ];
}

module.exports = { getMeetingAccessLevel, accessibleMeetingIds };
