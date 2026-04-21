const { Task, MOM, User } = require('../models');
const { createNotification } = require('../services/notification.service');
const { getMeetingAccessLevel } = require('../utils/meetingAccess');

async function resolveAssignee(assigneeId) {
  if (assigneeId === undefined || assigneeId === null || assigneeId === '') return null;
  return User.findByPk(assigneeId, { attributes: ['id', 'name', 'email'] });
}

async function notifyAssignee({ assigneeId, task, assignerName }) {
  if (!assigneeId) return;
  const mom = await MOM.findByPk(task.mom_id, { attributes: ['meeting_id'] });
  await createNotification(
    assigneeId,
    'task_assigned',
    'Task assigned to you',
    `${assignerName} assigned you: "${task.title}"`,
    { taskId: task.id, meetingId: mom?.meeting_id }
  );
}

async function listTasks(req, res, next) {
  try {
    const { meetingId, status, priority, assignee, assignee_id, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignee) where.assigned_to = assignee;
    if (assignee_id) {
      where.assignee_id = assignee_id === 'me' ? req.user.id : parseInt(assignee_id, 10);
    }

    if (meetingId) {
      // Check access level — task_only users can only see their own tasks
      const level = await getMeetingAccessLevel(req.user, meetingId);
      if (level === 'none') {
        return res.json({ total: 0, page: parseInt(page), limit: parseInt(limit), tasks: [] });
      }
      if (level === 'task_only') {
        where.assignee_id = req.user.id;
      }

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

    const assignee = await resolveAssignee(assignee_id);

    const task = await Task.create({
      mom_id,
      title,
      description,
      assigned_to: assigned_to ?? assignee?.name ?? null,
      assignee_id: assignee?.id ?? assignee_id ?? null,
      deadline,
      priority: priority || 'medium',
      status: status || 'pending',
    });

    // Notify assigned user
    await notifyAssignee({
      assigneeId: task.assignee_id,
      task,
      assignerName: req.user?.name || 'Someone',
    });

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

    const assignee = await resolveAssignee(assignee_id);

    const updates = { is_edited: true };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (assignee_id !== undefined) {
      updates.assignee_id = assignee?.id ?? null;
      updates.assigned_to = assigned_to ?? assignee?.name ?? null;
    }
    if (deadline !== undefined) updates.deadline = deadline;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;

    const prevAssigneeId = task.assignee_id;
    await task.update(updates);

    // Notify if assignee changed
    if (updates.assignee_id !== undefined && updates.assignee_id !== null && updates.assignee_id !== prevAssigneeId) {
      await notifyAssignee({
        assigneeId: updates.assignee_id,
        task,
        assignerName: req.user?.name || 'Someone',
      });
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
