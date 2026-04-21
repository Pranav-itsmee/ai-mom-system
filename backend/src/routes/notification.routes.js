const router = require('express').Router();
const { listNotifications, markRead, markAllRead } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',             listNotifications);
router.put('/read-all',     markAllRead);
router.put('/:id/read',     markRead);

module.exports = router;
