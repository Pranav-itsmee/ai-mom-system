const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MeetingAttendee = sequelize.define(
  'MeetingAttendee',
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
    user_id: {
      type: DataTypes.INTEGER,
    },
    name: {
      type: DataTypes.STRING(100),
    },
    email: {
      type: DataTypes.STRING(150),
    },
  },
  {
    tableName: 'meeting_attendees',
    timestamps: false,
  }
);

module.exports = MeetingAttendee;
