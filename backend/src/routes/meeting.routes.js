const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const {
  listMeetings,
  getMeeting,
  createMeeting,
  uploadMeeting,
  syncCalendar,
  updateMeetingStatus,
  deleteMeeting,
  startExtensionRecording,
  updateMeetingInfo,
  getCalendarEvents,
} = require('../controllers/meeting.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Multer — store uploads in TEMP_DIR (create if missing) or system temp
const uploadDir = process.env.TEMP_DIR
  ? path.resolve(process.env.TEMP_DIR)
  : os.tmpdir();

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `upload-${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.mp4', '.webm', '.wav', '.m4a', '.ogg', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: ${ext}`));
  },
});

router.use(authenticate);

router.get('/',                 listMeetings);
router.post('/',                createMeeting);
router.post('/extension/start', startExtensionRecording);
router.post('/upload',          upload.single('file'), uploadMeeting);
router.post('/sync',            syncCalendar);
router.get('/calendar-events',  getCalendarEvents);
router.get('/:id',              getMeeting);
router.patch('/:id/status',     updateMeetingStatus);
router.patch('/:id/info',       updateMeetingInfo);
router.delete('/:id',           deleteMeeting);

module.exports = router;
