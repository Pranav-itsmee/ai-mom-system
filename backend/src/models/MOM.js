const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MOM = sequelize.define(
  'MOM',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    meeting_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    raw_transcript: {
      type: DataTypes.TEXT('long'),
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_edited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    edited_by: {
      type: DataTypes.INTEGER,
    },
    edited_at: {
      type: DataTypes.DATE,
    },
  },
  {
    tableName: 'moms',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = MOM;
