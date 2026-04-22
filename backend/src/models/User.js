const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
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
    role: {
      type: DataTypes.ENUM('admin', 'member'),
      defaultValue: 'member',
    },
    avatar_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
    },
    google_refresh_token: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = User;
