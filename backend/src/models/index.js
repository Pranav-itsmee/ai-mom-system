const User = require('./User');
const Meeting = require('./Meeting');
const MOM = require('./MOM');
const MOMKeyPoint = require('./MOMKeyPoint');
const MOMVersion = require('./MOMVersion');
const Task = require('./Task');
const MeetingAttendee = require('./MeetingAttendee');
const Notification = require('./Notification');

// ── User ↔ Meeting (organizer) ─────────────────────────────────────────────
User.hasMany(Meeting, { foreignKey: 'organizer_id', as: 'organizedMeetings' });
Meeting.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });

// ── User ↔ Meeting (creator) ───────────────────────────────────────────────
User.hasMany(Meeting, { foreignKey: 'created_by', as: 'createdMeetings' });
Meeting.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// ── Meeting ↔ MOM (one-to-one) ─────────────────────────────────────────────
Meeting.hasOne(MOM, { foreignKey: 'meeting_id', as: 'mom' });
MOM.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

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
MeetingAttendee.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── User ↔ Notification ────────────────────────────────────────────────────
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

// ── Notification ↔ Task (for resolving meeting_id via task → MOM) ──────────
Notification.belongsTo(Task, { foreignKey: 'task_id', constraints: false });
Task.hasMany(Notification, { foreignKey: 'task_id', constraints: false });

// ── MOM ↔ MOMVersion ───────────────────────────────────────────────────────
MOM.hasMany(MOMVersion, { foreignKey: 'mom_id', as: 'versions', onDelete: 'CASCADE' });
MOMVersion.belongsTo(MOM, { foreignKey: 'mom_id' });
User.hasMany(MOMVersion, { foreignKey: 'archived_by', as: 'archivedVersions' });
MOMVersion.belongsTo(User, { foreignKey: 'archived_by', as: 'archivedByUser' });

module.exports = {
  User,
  Meeting,
  MOM,
  MOMKeyPoint,
  MOMVersion,
  Task,
  MeetingAttendee,
  Notification,
};
