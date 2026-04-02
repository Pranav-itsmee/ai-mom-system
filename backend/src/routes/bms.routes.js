const router = require('express').Router();
const { getProjects, linkMeetingToProject, getLinksForMeeting, removeLink } = require('../controllers/bms.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/projects', getProjects);
router.post('/link', linkMeetingToProject);
router.get('/links/:meetingId', getLinksForMeeting);
router.delete('/link/:id', removeLink);

module.exports = router;
