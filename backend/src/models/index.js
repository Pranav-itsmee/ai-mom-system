const User = require('./User');
const Meeting = require('./Meeting');
const MOM = require('./MOM');
const MOMKeyPoint = require('./MOMKeyPoint');
const Task = require('./Task');
const MeetingAttendee = require('./MeetingAttendee');
const MeetingProjectLink = require('./MeetingProjectLink');

// ── User ↔ Meeting (organizer) ─────────────────────────────────────────────
User.hasMany(Meeting, { foreignKey: 'organizer_id', as: 'organizedMeetings' });
Meeting.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });

// ── Meeting ↔ MOM (one-to-one) ─────────────────────────────────────────────
Meeting.hasOne(MOM, { foreignKey: 'meeting_id', as: 'mom' });
MOM.belongsTo(Meeting, { foreignKey: 'meeting_id' });

// ── MOM ↔ MOMKeyPoint ──────────────────────────────────────────────────────
MOM.hasMany(MOMKeyPoint, { foreignKey: 'mom_id', as: 'keyPoints', onDelete: 'CASCADE' });
MOMKeyPoint.belongsTo(MOM, { foreignKey: 'mom_id' });

// ── MOM ↔ Task ─────────────────────────────────────────────────────────────
MOM.hasMany(Task, { foreignKey: 'mom_id', as: 'tasks', onDelete: 'CASCADE' });
Task.belongsTo(MOM, { foreignKey: 'mom_id' });

// ── User ↔ Task (assignee) ─────────────────────────────────────────────────
User.hasMany(Task, { foreignKey: 'assignee_id', as: 'assignedTasks' });
Task.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee' });

// ── User ↔ MOM (editor) ────────────────────────────────────────────────────
User.hasMany(MOM, { foreignKey: 'edited_by', as: 'editedMOMs' });
MOM.belongsTo(User, { foreignKey: 'edited_by', as: 'editor' });

// ── Meeting ↔ MeetingAttendee ──────────────────────────────────────────────
Meeting.hasMany(MeetingAttendee, { foreignKey: 'meeting_id', as: 'attendees', onDelete: 'CASCADE' });
MeetingAttendee.belongsTo(Meeting, { foreignKey: 'meeting_id' });
User.hasMany(MeetingAttendee, { foreignKey: 'user_id', as: 'attendances' });
MeetingAttendee.belongsTo(User, { foreignKey: 'user_id' });

// ── Meeting ↔ MeetingProjectLink ───────────────────────────────────────────
Meeting.hasMany(MeetingProjectLink, { foreignKey: 'meeting_id', as: 'projectLinks' });
MeetingProjectLink.belongsTo(Meeting, { foreignKey: 'meeting_id' });
User.hasMany(MeetingProjectLink, { foreignKey: 'linked_by', as: 'projectLinks' });
MeetingProjectLink.belongsTo(User, { foreignKey: 'linked_by', as: 'linkedByUser' });

module.exports = {
  User,
  Meeting,
  MOM,
  MOMKeyPoint,
  Task,
  MeetingAttendee,
  MeetingProjectLink,
};
