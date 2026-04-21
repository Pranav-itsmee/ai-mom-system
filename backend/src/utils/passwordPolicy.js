const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '10', 10);

const PASSWORD_REQUIREMENTS_TEXT =
  `be at least ${PASSWORD_MIN_LENGTH} characters long and include uppercase, lowercase, number, and special characters`;

function validatePasswordStrength(password = '') {
  const value = String(password);
  const errors = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push(`be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  if (!/[A-Z]/.test(value)) {
    errors.push('include at least one uppercase letter');
  }
  if (!/[a-z]/.test(value)) {
    errors.push('include at least one lowercase letter');
  }
  if (!/\d/.test(value)) {
    errors.push('include at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push('include at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors.length ? `Password must ${errors.join(', ')}.` : null,
  };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_TEXT,
  validatePasswordStrength,
};
