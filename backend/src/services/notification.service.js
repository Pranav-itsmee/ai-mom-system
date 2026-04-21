const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Create a notification for a user.
 */
async function createNotification(userId, type, title, message, { taskId, meetingId } = {}) {
  try {
    await Notification.create({
      user_id:    userId,
      type,
      title,
      message,
      task_id:    taskId    ?? null,
      meeting_id: meetingId ?? null,
    });
  } catch (err) {
    logger.error(`Failed to create notification for user ${userId}: ${err.message}`);
  }
}

/**
 * Find tasks whose deadline is within the next 24 hours and notify the assignee.
 * Called once daily by the scheduler.
 */
async function sendDeadlineReminders() {
  try {
    const { Task } = require('../models');

    const now      = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const tasks = await Task.findAll({
      where: {
        assignee_id: { [Op.not]: null },
        status:      { [Op.ne]: 'completed' },
        deadline:    { [Op.between]: [todayStr, tomorrowStr] },
      },
    });

    for (const task of tasks) {
      await createNotification(
        task.assignee_id,
        'task_deadline',
        'Task deadline approaching',
        `"${task.title}" is due on ${task.deadline}`,
        { taskId: task.id }
      );
    }

    logger.info(`Deadline reminders sent for ${tasks.length} task(s)`);
  } catch (err) {
    logger.error(`sendDeadlineReminders failed: ${err.message}`);
  }
}

module.exports = { createNotification, sendDeadlineReminders };
