const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Histórico de solicitações de exportação de relatório (por cliente anônimo via X-Export-Client-Id).
 * Quando houver JWT no front, pode-se acrescentar userId e filtrar por usuário.
 */
const ReportExport = sequelize.define(
  'ReportExport',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clientKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'client_key'
    },
    reportTypeLabel: {
      type: DataTypes.STRING(160),
      allowNull: false,
      field: 'report_type_label'
    },
    localityLabel: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'locality_label'
    },
    periodLabel: {
      type: DataTypes.STRING(240),
      allowNull: false,
      field: 'period_label'
    },
    format: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'registrado'
    },
    generatedWithAi: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'generated_with_ai'
    }
  },
  {
    tableName: 'report_exports',
    timestamps: true,
    indexes: [{ fields: ['client_key'] }, { fields: ['created_at'] }]
  }
);

module.exports = ReportExport;
