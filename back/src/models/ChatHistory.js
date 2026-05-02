const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatHistory = sequelize.define(
  'ChatHistory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    threadId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'thread_id',
    },
    clerkUserId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'clerk_user_id',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'completed',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    isFavorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_favorite',
    },
  },
  {
    tableName: 'chat_history',
    timestamps: true,
    indexes: [
      { fields: ['thread_id'] },
      { fields: ['created_at'] },
      { fields: ['is_active'] },
      { fields: ['is_favorite'] },
      { fields: ['clerk_user_id', 'is_active'] },
    ],
  }
);

module.exports = ChatHistory;
