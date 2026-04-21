const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Notification = sequelize.define(
  'Notification',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id:    { type: DataTypes.INTEGER, allowNull: false },
    type: {
      type: DataTypes.ENUM('task_assigned', 'task_deadline', 'meeting_starting'),
      allowNull: false,
    },
    title:      { type: DataTypes.STRING(255), allowNull: false },
    message:    { type: DataTypes.TEXT, allowNull: false },
    task_id:    { type: DataTypes.INTEGER, allowNull: true },
    meeting_id: { type: DataTypes.INTEGER, allowNull: true },
    is_read:    { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: 'notifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = Notification;
