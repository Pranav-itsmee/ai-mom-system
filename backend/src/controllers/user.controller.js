const { User } = require('../models');

/** GET /users — returns all users (for task assignment picker) */
async function listUsers(req, res, next) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role'],
      order: [['name', 'ASC']],
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers };
