const { Task, MOM, User } = require('../models');
const { createNotification } = require('../services/notification.service');

async function listTasks(req, res, next) {
  try {
    const { meetingId, status, priority, assignee, assignee_id, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignee) where.assigned_to = assignee;
    if (assignee_id) {
      // 'me' is a convenience alias for the calling user's own id
      where.assignee_id = assignee_id === 'me' ? req.user.id : parseInt(assignee_id, 10);
    }

    // If filtering by meetingId, first get the mom_id
    if (meetingId) {
      const mom = await MOM.findOne({ where: { meeting_id: meetingId }, attributes: ['id'] });
      if (!mom) {
        return res.json({ total: 0, page: parseInt(page), limit: parseInt(limit), tasks: [] });
      }
      where.mom_id = mom.id;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
      ],
      order: [
        ['priority', 'ASC'],
        ['created_at', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });

    res.json({ total: count, page: parseInt(page), limit: parseInt(limit), tasks: rows });
  } catch (err) {
    next(err);
  }
}

async function createTask(req, res, next) {
  try {
    const { mom_id, title, description, assigned_to, assignee_id, deadline, priority, status } = req.body;

    if (!mom_id || !title) {
      return res.status(400).json({ error: 'mom_id and title are required' });
    }

    const mom = await MOM.findByPk(mom_id);
    if (!mom) {
      return res.status(404).json({ error: 'MOM not found' });
    }

    const task = await Task.create({
      mom_id,
      title,
      description,
      assigned_to,
      assignee_id,
      deadline,
      priority: priority || 'medium',
      status: status || 'pending',
    });

    // Notify assigned user
    if (assignee_id) {
      const assigner = req.user?.name || 'Someone';
      await createNotification(
        assignee_id,
        'task_assigned',
        'New task assigned to you',
        `${assigner} assigned you: "${title}"`,
        { taskId: task.id }
      );
    }

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const { title, description, assigned_to, assignee_id, deadline, priority, status } = req.body;

    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = { is_edited: true };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (assignee_id !== undefined) updates.assignee_id = assignee_id;
    if (deadline !== undefined) updates.deadline = deadline;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;

    const prevAssigneeId = task.assignee_id;
    await task.update(updates);

    // Notify if assignee changed
    if (assignee_id !== undefined && assignee_id !== null && assignee_id !== prevAssigneeId) {
      const assigner = req.user?.name || 'Someone';
      await createNotification(
        assignee_id,
        'task_assigned',
        'Task assigned to you',
        `${assigner} assigned you: "${task.title}"`,
        { taskId: task.id }
      );
    }

    const updated = await Task.findByPk(task.id, {
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await task.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listTasks, createTask, updateTask, deleteTask };
