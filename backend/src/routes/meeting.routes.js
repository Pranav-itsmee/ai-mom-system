const router = require('express').Router();
const {
  listMeetings,
  getMeeting,
  syncCalendar,
  updateMeetingStatus,
  deleteMeeting,
} = require('../controllers/meeting.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', listMeetings);
router.get('/:id', getMeeting);
router.post('/sync', syncCalendar);
router.patch('/:id/status', updateMeetingStatus);
router.delete('/:id', deleteMeeting);

module.exports = router;
