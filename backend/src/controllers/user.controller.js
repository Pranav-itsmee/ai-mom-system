const bcrypt = require('bcryptjs');
const { User } = require('../models');

/** GET /users — all users (used for task assignment picker) */
async function listUsers(req, res, next) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'created_at'],
      order: [['name', 'ASC']],
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

/** POST /users — admin creates a new user account */
async function createUser(req, res, next) {
  try {
    const { name, email, password, role = 'member' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or member' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      password: hashed,
      role,
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at },
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /users/:id — admin removes a user (cannot delete self) */
async function deleteUser(req, res, next) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findByPk(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await user.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, deleteUser };
