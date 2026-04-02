const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Meeting = sequelize.define(
  'Meeting',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    google_event_id: {
      type: DataTypes.STRING(255),
      unique: true,
    },
    meet_link: {
      type: DataTypes.STRING(500),
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    started_at: {
      type: DataTypes.DATE,
    },
    ended_at: {
      type: DataTypes.DATE,
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
    },
    organizer_id: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'recording', 'processing', 'completed', 'failed'),
      defaultValue: 'scheduled',
    },
    audio_path: {
      type: DataTypes.STRING(500),
    },
    claude_file_id: {
      type: DataTypes.STRING(255),
    },
  },
  {
    tableName: 'meetings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = Meeting;
