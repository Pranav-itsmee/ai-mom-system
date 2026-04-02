const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MOMKeyPoint = sequelize.define(
  'MOMKeyPoint',
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
    point_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    order_index: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: 'mom_key_points',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = MOMKeyPoint;
