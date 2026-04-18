const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Avisos meteorológicos oficiais ingeridos de fonte configurável (ex.: JSON gerado a partir do INMET).
 * Não inventar URL do INMET: use INMET_ALERTS_JSON_URL apontando para um JSON no contrato documentado em DATA_SOURCES.md.
 */
const OfficialAlert = sequelize.define(
  'OfficialAlert',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    source: {
      type: DataTypes.ENUM('inmet', 'cptec', 'defesa_civil', 'outros'),
      allowNull: false,
      field: 'source'
    },
    externalId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'external_id'
    },
    severityRaw: {
      type: DataTypes.STRING(40),
      field: 'severity_raw'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'title'
    },
    description: {
      type: DataTypes.TEXT,
      field: 'description'
    },
    validFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'valid_from'
    },
    validTo: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'valid_to'
    },
    states: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'states'
    },
    payload: {
      type: DataTypes.JSONB,
      field: 'payload'
    }
  },
  {
    tableName: 'official_alerts',
    timestamps: true,
    indexes: [
      { fields: ['source'] },
      { fields: ['valid_from', 'valid_to'] },
      { unique: true, fields: ['source', 'external_id'] }
    ]
  }
);

module.exports = OfficialAlert;
