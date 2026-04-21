const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const {
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
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { createRateLimiter } = require('../middleware/rateLimit.middleware');

const passwordResetWindowMinutes = parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES || '15', 10);
const passwordResetRequestLimiter = createRateLimiter({
  keyPrefix: 'password-reset-request',
  windowMs: passwordResetWindowMinutes * 60 * 1000,
  max: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX || '5', 10),
  message: 'Too many password reset requests. Please try again later.',
});
const passwordResetTokenLimiter = createRateLimiter({
  keyPrefix: 'password-reset-token',
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many reset attempts. Please request a new password reset link.',
});

// ── Avatar upload (multer) ────────────────────────────────────────────────────
const avatarDir = path.resolve(__dirname, '../../public/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename:    (req,  _file, cb) => {
    const ext = _file.originalname.split('.').pop();
    cb(null, `user-${req.user?.id ?? 'unknown'}-${Date.now()}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);
router.post('/extension-login', extensionLogin);
router.post('/password-reset/request', passwordResetRequestLimiter, requestPasswordReset);
router.get('/password-reset/validate', passwordResetTokenLimiter, validatePasswordResetToken);
router.post('/password-reset/reset', passwordResetTokenLimiter, resetPassword);
router.get('/me',        authenticate, getMe);
router.put('/profile',   authenticate, upload.single('avatar'), updateProfile);

// ── Google Calendar OAuth ─────────────────────────────────────────────────────
router.get('/google/connect',    authenticate, connectGoogle);
router.get('/google/callback',   googleCallback);       // public — Google redirects here
router.get('/google/status',     authenticate, googleStatus);
router.delete('/google/disconnect', authenticate, googleDisconnect);

module.exports = router;
