const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MOMVersion = sequelize.define(
  'MOMVersion',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    mom_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    key_points_json: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    archived_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    archived_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'mom_versions',
    timestamps: false,
  }
);

module.exports = MOMVersion;
