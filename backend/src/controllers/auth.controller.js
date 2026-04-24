const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { URL } = require('url');
const { Op } = require('sequelize');
const { google } = require('googleapis');
const { User } = require('../models');
const logger = require('../utils/logger');
const {
  PASSWORD_REQUIREMENTS_TEXT,
  validatePasswordStrength,
} = require('../utils/passwordPolicy');

const PASSWORD_RESET_TOKEN_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || '15', 10);
let authMailTransportPromise = null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTokenPayload(user) {
  return { id: user.id, email: user.email, role: user.role };
}

function issueAppToken(user) {
  return jwt.sign(
    buildTokenPayload(user),
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function buildExtensionFingerprint(user) {
  return crypto
    .createHash('sha256')
    .update(`${user.id}:${user.password}:${process.env.JWT_SECRET}`)
    .digest('hex');
}

function issueExtensionToken(user) {
  return jwt.sign(
    {
      ...buildTokenPayload(user),
      token_type: 'extension',
      fp: buildExtensionFingerprint(user),
    },
    process.env.JWT_SECRET
  );
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    hashedToken: hashPasswordResetToken(rawToken),
  };
}

function getPrimaryFrontendUrl() {
  const frontendUrl = (process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000').trim();
  const parsed = new URL(frontendUrl);

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    const err = new Error('FRONTEND_URL must use HTTPS in production for password reset links');
    err.status = 500;
    throw err;
  }

  return parsed.toString().replace(/\/$/, '');
}

async function getAuthMailTransport() {
  if (!authMailTransportPromise) {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      authMailTransportPromise = Promise.resolve({
        transporter: nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        }),
        previewMode: false,
      });
    } else {
      logger.warn('SMTP env vars not configured; auth emails will be logged locally in preview mode');
      authMailTransportPromise = Promise.resolve({
        transporter: nodemailer.createTransport({ jsonTransport: true }),
        previewMode: true,
      });
    }
  }

  return authMailTransportPromise;
}

async function sendAuthEmail({ to, subject, html, text, logLabel }) {
  const { transporter, previewMode } = await getAuthMailTransport();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"AI MOM System" <noreply@aimom.local>',
    to,
    subject,
    html,
    text,
  });

  if (previewMode && logLabel) {
    logger.info(`${logLabel}\n${text}`);
  }
}

function buildPasswordResetEmail(user, resetUrl) {
  const safeName = escapeHtml(user.name || 'there');
  const safeUrl = escapeHtml(resetUrl);

  return {
    subject: 'Reset your AI MOM password',
    text: [
      `Hello ${user.name || 'there'},`,
      '',
      'We received a request to reset your AI MOM password.',
      `Use the secure link below within ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes:`,
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#37353E">
        <h1 style="font-size:22px;margin:0 0 12px">Reset your password</h1>
        <p style="font-size:14px;line-height:1.7;margin:0 0 16px">Hello ${safeName},</p>
        <p style="font-size:14px;line-height:1.7;margin:0 0 16px">
          We received a request to reset your AI MOM password. This secure link expires in
          <strong>${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes</strong> and can only be used once.
        </p>
        <div style="margin:28px 0;text-align:center">
          <a href="${safeUrl}" style="display:inline-block;background:#3A8899;color:#FFFFFF;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
        </div>
        <p style="font-size:13px;line-height:1.7;margin:0 0 8px">If the button does not work, copy and paste this URL into your browser:</p>
        <p style="font-size:12px;line-height:1.7;word-break:break-all;margin:0 0 16px">${safeUrl}</p>
        <p style="font-size:12px;line-height:1.7;color:#7D7589;margin:0">
          If you did not request this change, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}

function buildPasswordChangedEmail(user) {
  const safeName = escapeHtml(user.name || 'there');

  return {
    subject: 'Your AI MOM password was changed',
    text: [
      `Hello ${user.name || 'there'},`,
      '',
      'This is a confirmation that your AI MOM password was changed successfully.',
      'If you did not make this change, please contact your administrator immediately.',
    ].join('\n'),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#37353E">
        <h1 style="font-size:22px;margin:0 0 12px">Password changed</h1>
        <p style="font-size:14px;line-height:1.7;margin:0 0 16px">Hello ${safeName},</p>
        <p style="font-size:14px;line-height:1.7;margin:0 0 16px">
          This is a confirmation that your AI MOM password was changed successfully.
        </p>
        <p style="font-size:12px;line-height:1.7;color:#7D7589;margin:0">
          If you did not make this change, please contact your administrator immediately.
        </p>
      </div>
    `,
  };
}

function passwordValidationError(validation) {
  return {
    error: validation.message,
    details: validation.errors,
    password_requirements: PASSWORD_REQUIREMENTS_TEXT,
  };
}

async function findUserByValidResetToken(rawToken) {
  return User.findOne({
    where: {
      password_reset_token_hash: hashPasswordResetToken(rawToken),
      password_reset_used_at: null,
      password_reset_expires_at: {
        [Op.gt]: new Date(),
      },
    },
  });
}

async function register(req, res, next) {
  try {
    const { name, password, role } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json(passwordValidationError(passwordValidation));
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email,
      password: hashed,
      password_changed_at: new Date(),
      role: role === 'admin' ? 'admin' : 'member',
    });

    const token = issueAppToken(user);

    res.status(201).json({
      token,
      user: safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueAppToken(user);

    res.json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function extensionLogin(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueExtensionToken(user);

    res.json({
      token,
      token_type: 'extension',
      user: safeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

function getMe(req, res, next) {
  User.findByPk(req.user.id)
    .then((user) => {
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user: safeUser(user) });
    })
    .catch(next);
}

async function requestPasswordReset(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
    const user = await User.findOne({ where: { email } });

    if (user) {
      const { rawToken, hashedToken } = buildPasswordResetToken();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      const frontendUrl = getPrimaryFrontendUrl();
      const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

      await user.update({
        password_reset_token_hash: hashedToken,
        password_reset_expires_at: expiresAt,
        password_reset_used_at: null,
      });

      try {
        const emailContent = buildPasswordResetEmail(user, resetUrl);
        await sendAuthEmail({
          to: user.email,
          ...emailContent,
          logLabel: `Password reset preview for ${user.email}`,
        });
      } catch (mailError) {
        await user.update({
          password_reset_token_hash: null,
          password_reset_expires_at: null,
          password_reset_used_at: null,
        });
        throw mailError;
      }
    }

    res.json({ message: genericMessage });
  } catch (err) {
    next(err);
  }
}

async function validatePasswordResetToken(req, res, next) {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    const user = await findUserByValidResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    }

    res.json({
      valid: true,
      expires_at: user.password_reset_expires_at,
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');

    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json(passwordValidationError(passwordValidation));
    }

    const user = await findUserByValidResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await user.update({
      password: hashedPassword,
      password_changed_at: new Date(),
      password_reset_token_hash: null,
      password_reset_expires_at: null,
      password_reset_used_at: new Date(),
    });

    try {
      const emailContent = buildPasswordChangedEmail(user);
      await sendAuthEmail({
        to: user.email,
        ...emailContent,
        logLabel: `Password change confirmation preview for ${user.email}`,
      });
    } catch (mailError) {
      logger.warn(`Password changed email failed for ${user.email}: ${mailError.message}`);
    }

    res.json({
      message: 'Password reset successful. Please sign in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};

    if (req.body.name && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }

    const normalizedEmail = normalizeEmail(req.body.email);
    if (normalizedEmail && normalizedEmail !== user.email) {
      const clash = await User.findOne({ where: { email: normalizedEmail } });
      if (clash) return res.status(409).json({ error: 'Email already in use' });
      updates.email = normalizedEmail;
    }

    if (req.body.new_password) {
      if (!req.body.current_password) {
        return res.status(400).json({ error: 'current_password is required to set a new password' });
      }

      const ok = await bcrypt.compare(req.body.current_password, user.password);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

      const passwordValidation = validatePasswordStrength(req.body.new_password);
      if (!passwordValidation.valid) {
        return res.status(400).json(passwordValidationError(passwordValidation));
      }

      updates.password = await bcrypt.hash(req.body.new_password, 12);
      updates.password_changed_at = new Date();
    }

    if (req.file) {
      updates.avatar_url = `/avatars/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ user: safeUser(user) });
    }

    await user.update(updates);
    res.json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback'
  );
}

async function connectGoogle(req, res) {
  const oauth2 = getOAuthClient();
  const state = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback';
  console.log('[Google OAuth] redirect_uri being sent to Google:', redirectUri);

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state,
  });

  res.json({ url, debug_redirect_uri: redirectUri });
}

async function googleCallback(req, res) {
  const { code, state } = req.query;

  try {
    const { id } = jwt.verify(state, process.env.JWT_SECRET);
    const oauth2 = getOAuthClient();
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

async function googleStatus(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id);
    res.json({ connected: !!user?.google_refresh_token });
  } catch (err) {
    next(err);
  }
}

async function googleDisconnect(req, res, next) {
  try {
    await User.update({ google_refresh_token: null }, { where: { id: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url ?? null,
    google_connected: !!user.google_refresh_token,
    created_at: user.created_at,
  };
}

module.exports = {
  register,
  login,
  extensionLogin,
  requestPasswordReset,
  validatePasswordResetToken,
  resetPassword,
  getMe,
  updateProfile,
  connectGoogle,
  googleCallback,
  googleStatus,
  googleDisconnect,
};
