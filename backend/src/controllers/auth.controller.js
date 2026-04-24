const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const path   = require('path');
const { google } = require('googleapis');
const { User } = require('../models');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildTokenPayload(user) {
  return { id: user.id, email: user.email, role: user.role };
}

function buildExtensionFingerprint(user) {
  return crypto
    .createHash('sha256')
    .update(`${user.id}:${user.password}:${process.env.JWT_SECRET}`)
    .digest('hex');
}

function issueExtensionToken(user) {
  return jwt.sign(
    { ...buildTokenPayload(user), token_type: 'extension', fp: buildExtensionFingerprint(user) },
    process.env.JWT_SECRET
  );
}

async function extensionLogin(req, res, next) {
  try {
    const email    = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueExtensionToken(user);
    res.json({ token, token_type: 'extension', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
}

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

// ── Google Calendar OAuth ─────────────────────────────────────────────────────

function _getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback'
  );
}

// GET /auth/google/connect  (authenticated)
// Returns the Google OAuth consent URL; state = signed JWT so callback knows who to update
async function connectGoogle(req, res) {
  const oauth2 = _getOAuthClient();
  const state  = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback';
  console.log('[Google OAuth] redirect_uri being sent to Google:', redirectUri);

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state,
  });
  res.json({ url, debug_redirect_uri: redirectUri });
}

// GET /auth/google/callback  (public — called by Google)
async function googleCallback(req, res) {
  const { code, state } = req.query;
  try {
    const { id } = jwt.verify(state, process.env.JWT_SECRET);
    const oauth2 = _getOAuthClient();
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/settings?google=no_refresh_token`);
    }

    await User.update({ google_refresh_token: tokens.refresh_token }, { where: { id } });

    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?google=connected`);
  } catch (err) {
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?google=error`);
  }
}

// GET /auth/google/status  (authenticated)
async function googleStatus(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id);
    res.json({ connected: !!user?.google_refresh_token });
  } catch (err) {
    next(err);
  }
}

// DELETE /auth/google/disconnect  (authenticated)
async function googleDisconnect(req, res, next) {
  try {
    await User.update({ google_refresh_token: null }, { where: { id: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeUser(user) {
  return {
    id:               user.id,
    name:             user.name,
    email:            user.email,
    role:             user.role,
    avatar_url:       user.avatar_url ?? null,
    google_connected: !!user.google_refresh_token,
    created_at:       user.created_at,
  };
}

module.exports = { register, login, extensionLogin, getMe, updateProfile, connectGoogle, googleCallback, googleStatus, googleDisconnect };
