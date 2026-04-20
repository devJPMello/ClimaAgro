const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Observações SIDRA / IBGE tabela 1612 (lavouras temporárias) em formato longo —
 * saída do ETL `ibge_tabela1612_long.csv` (Ano, Município, Produto, Variável, Valor).
 */
const IbgeSidra1612Row = sequelize.define(
  'IbgeSidra1612Row',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'year',
    },
    municipalityName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'municipality_name',
    },
    productLabel: {
      type: DataTypes.STRING(300),
      allowNull: false,
      field: 'product_label',
    },
    variableKey: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'variable_key',
    },
    valueNumeric: {
      type: DataTypes.DECIMAL(24, 8),
      allowNull: true,
      field: 'value_numeric',
    },
    geoDataId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'geo_data_id',
      references: { model: 'geo_data', key: 'id' },
    },
  },
  {
    tableName: 'ibge_sidra_1612',
    timestamps: true,
    indexes: [
      { fields: ['year'] },
      { fields: ['municipality_name'] },
      { fields: ['variable_key'] },
      {
        unique: true,
        fields: ['year', 'municipality_name', 'product_label', 'variable_key'],
        name: 'ibge_sidra_1612_year_mun_prod_var_uidx',
      },
    ],
  }
);

module.exports = IbgeSidra1612Row;
