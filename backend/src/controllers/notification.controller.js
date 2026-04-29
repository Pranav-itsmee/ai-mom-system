const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const { Task, MOM } = require('../models');

/** GET /notifications — returns unread first, capped at 30 */
async function listNotifications(req, res, next) {
  try {
    const items = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [
        ['is_read', 'ASC'],
        ['created_at', 'DESC'],
      ],
      limit: 30,
      include: [{
        model: Task,
        attributes: ['id', 'mom_id'],
        required: false,
        include: [{
          model: MOM,
          attributes: ['meeting_id'],
          required: false,
        }],
      }],
    });

    // Resolve meeting_id via task → MOM when not stored directly on the notification
    const notifications = items.map((n) => {
      const plain = n.toJSON();
      if (!plain.meeting_id && plain.Task?.MOM?.meeting_id) {
        plain.meeting_id = plain.Task.MOM.meeting_id;
      }
      delete plain.Task;
      return plain;
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

/** PUT /notifications/:id/read */
async function markRead(req, res, next) {
  try {
    const notif = await Notification.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!notif) return res.status(404).json({ error: 'Not found' });
    await notif.update({ is_read: true });
    res.json(notif);
  } catch (err) {
    next(err);
  }
}

/** PUT /notifications/read-all */
async function markAllRead(req, res, next) {
  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, markRead, markAllRead };
