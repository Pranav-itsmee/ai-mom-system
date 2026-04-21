const router = require('express').Router();
const { listUsers } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', listUsers);

module.exports = router;
