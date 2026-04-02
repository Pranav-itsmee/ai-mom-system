const router = require('express').Router();
const { getMOMById, getMOMByMeeting, updateMOM, regenerateMOM, searchMOMs } = require('../controllers/mom.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// Specific routes before parameterised routes to avoid conflicts
router.get('/search', searchMOMs);
router.get('/id/:id', getMOMById);        // fetch by MOM's own PK (used by edit page)
router.get('/:meetingId', getMOMByMeeting);
router.put('/:id', updateMOM);
router.post('/:id/regenerate', regenerateMOM);

module.exports = router;
