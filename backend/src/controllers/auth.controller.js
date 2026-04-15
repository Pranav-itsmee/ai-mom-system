const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const path   = require('path');
const { User } = require('../models');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user   = await User.create({
      name, email,
      password: hashed,
      role: role === 'admin' ? 'admin' : 'member',
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user: _safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, user: _safeUser(user) });
  } catch (err) {
    next(err);
  }
}

function getMe(req, res, next) {
  User.findByPk(req.user.id)
    .then((user) => {
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user: _safeUser(user) });
    })
    .catch(next);
}

async function updateProfile(req, res, next) {
  try {
    const user    = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};

    // Name
    if (req.body.name && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }

    // Email — check uniqueness
    if (req.body.email && req.body.email.trim() !== user.email) {
      const clash = await User.findOne({ where: { email: req.body.email.trim() } });
      if (clash) return res.status(409).json({ error: 'Email already in use' });
      updates.email = req.body.email.trim();
    }

    // Password change (requires current password)
    if (req.body.new_password) {
      if (!req.body.current_password) {
        return res.status(400).json({ error: 'current_password is required to set a new password' });
      }
      const ok = await bcrypt.compare(req.body.current_password, user.password);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
      if (req.body.new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      updates.password = await bcrypt.hash(req.body.new_password, 12);
    }

    // Avatar file upload
    if (req.file) {
      updates.avatar_url = `/avatars/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ user: _safeUser(user) });
    }

    await user.update(updates);
    res.json({ user: _safeUser(user) });
  } catch (err) {
    next(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeUser(user) {
  return {
    id:         user.id,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    avatar_url: user.avatar_url ?? null,
    created_at: user.created_at,
  };
}

module.exports = { register, login, getMe, updateProfile };
