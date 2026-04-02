const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MeetingProjectLink = sequelize.define(
  'MeetingProjectLink',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    meeting_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    linked_by: {
      type: DataTypes.INTEGER,
    },
  },
  {
    tableName: 'meeting_project_links',
    timestamps: true,
    createdAt: 'linked_at',
    updatedAt: false,
  }
);

module.exports = MeetingProjectLink;
