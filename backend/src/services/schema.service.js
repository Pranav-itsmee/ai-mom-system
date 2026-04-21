const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const logger = require('../utils/logger');

async function ensureUserSecurityColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('users');

  const requiredColumns = {
    password_reset_token_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
    },
    password_reset_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    password_reset_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    password_changed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  };

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!table[columnName]) {
      await queryInterface.addColumn('users', columnName, definition);
      logger.info(`Added missing users.${columnName} column`);
    }
  }
}

module.exports = { ensureUserSecurityColumns };
