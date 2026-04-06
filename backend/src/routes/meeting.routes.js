const router = require('express').Router();
const {
  listMeetings,
  getMeeting,
  syncCalendar,
  updateMeetingStatus,
  deleteMeeting,
  admitWaiting,
  getWaiting,
} = require('../controllers/meeting.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', listMeetings);
router.get('/:id', getMeeting);
router.post('/sync', syncCalendar);
router.patch('/:id/status', updateMeetingStatus);
router.delete('/:id', deleteMeeting);

// Admission control — bot never auto-admits; only triggered by authorised API call
router.get('/:id/waiting', getWaiting);
router.post('/:id/admit', admitWaiting);

module.exports = router;
