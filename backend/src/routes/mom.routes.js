const router = require('express').Router();
const {
  getMOMById, getMOMByMeeting, listMOMs,
  updateMOM, getMOMVersions, regenerateMOM, searchMOMs, archiveMOM,
} = require('../controllers/mom.controller');
const { shareByEmail, shareByGoogleChat } = require('../controllers/momShare.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// Specific routes first (before parameterised) to avoid conflicts
router.get('/search',        searchMOMs);
router.get('/list',          listMOMs);          // user-scoped MOM list
router.get('/id/:id',        getMOMById);         // fetch by MOM's own PK
router.get('/:id/versions',  getMOMVersions);     // version history
router.get('/:meetingId',    getMOMByMeeting);    // fetch by meeting ID
router.put('/:id',               updateMOM);
router.patch('/:id/archive',     archiveMOM);
router.post('/:id/regenerate',   regenerateMOM);
router.post('/:id/share/email',     shareByEmail);
router.post('/:id/share/googlechat', shareByGoogleChat);

module.exports = router;
