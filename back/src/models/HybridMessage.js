const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HybridMessage = sequelize.define(
  'HybridMessage',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id',
      references: { model: 'hybrid_conversations', key: 'id' },
    },
    remetenteId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'remetente_id',
    },
    conteudo: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM('texto', 'imagem', 'audio'),
      allowNull: false,
      defaultValue: 'texto',
    },
    origem: {
      type: DataTypes.ENUM('sistema', 'whatsapp'),
      allowNull: false,
    },
    midiaStorageKey: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'midia_storage_key',
    },
    midiaMimeType: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'midia_mime_type',
    },
  },
  {
    tableName: 'hybrid_messages',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['conversationId'] }, { fields: ['createdAt'] }],
  }
);

module.exports = HybridMessage;
