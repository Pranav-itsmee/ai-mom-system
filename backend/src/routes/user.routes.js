const router = require('express').Router();
const { listUsers, createUser, deleteUser } = require('../controllers/user.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',     listUsers);
router.post('/',    requireRole('admin'), createUser);
router.delete('/:id', requireRole('admin'), deleteUser);

module.exports = router;
