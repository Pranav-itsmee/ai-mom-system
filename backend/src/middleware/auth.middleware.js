const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

function buildExtensionFingerprint(user) {
  return crypto
    .createHash('sha256')
    .update(`${user.id}:${user.password}:${process.env.JWT_SECRET}`)
    .digest('hex');
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'name', 'email', 'role', 'password'],
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (decoded.token_type === 'extension') {
      const expected = buildExtensionFingerprint(user);
      if (!decoded.fp || decoded.fp !== expected) {
        return res.status(401).json({ error: 'Extension session invalidated. Please log in again.' });
      }
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
