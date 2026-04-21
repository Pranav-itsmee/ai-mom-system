const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const {
  register,
  login,
  extensionLogin,
  getMe,
  updateProfile,
  connectGoogle,
  googleCallback,
  googleStatus,
  googleDisconnect,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

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
router.get('/me',        authenticate, getMe);
router.put('/profile',   authenticate, upload.single('avatar'), updateProfile);

// ── Google Calendar OAuth ─────────────────────────────────────────────────────
router.get('/google/connect',    authenticate, connectGoogle);
router.get('/google/callback',   googleCallback);       // public — Google redirects here
router.get('/google/status',     authenticate, googleStatus);
router.delete('/google/disconnect', authenticate, googleDisconnect);

module.exports = router;
