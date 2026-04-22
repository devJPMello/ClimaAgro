const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');

const Productivity = sequelize.define('Productivity', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Referência ao GeoData (opcional — SIDRA pode existir só com nome/código IBGE do município)
  geoDataId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'geo_data_id',
    references: {
      model: 'geo_data',
      key: 'id'
    }
  },
  /** UF do município (denormalizado; filtro sem depender de join em geo_data). */
  state: {
    type: DataTypes.STRING(2),
    allowNull: false,
    defaultValue: 'TO',
    field: 'state'
  },
  /** Nome do município como no SIDRA / IBGE. */
  municipalityName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'municipality_name'
  },
  /** Chave estável para unicidade (nome normalizado, sem acento). */
  municipalityKey: {
    type: DataTypes.STRING(220),
    allowNull: false,
    field: 'municipality_key'
  },
  /** Código IBGE do município (7 dígitos), para mapas / joins externos. */
  municipalityIbgeCode: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'municipality_ibge_code'
  },
  // Ano da safra
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'year'
  },
  // Referência mensal opcional (YYYY-MM) quando fonte é mensal
  periodRef: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'period_ref'
  },
  // Safra (ex: 2024/25)
  season: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'season'
  },
  /**
   * Categoria/cultura: chaves canónicas (soja, milho, …) ou slug do produto SIDRA
   * (ex.: abacaxi, mandioca) — ver `sidra1612ProductCropMap.js`.
   */
  cropType: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'crop_type'
  },
  /** Rótulo do produto (ex.: texto SIDRA) — chave lógica do mapa/listagem junto com geo/ano. */
  productLabel: {
    type: DataTypes.STRING(300),
    allowNull: false,
    field: 'product_label'
  },
  // Produtividade em toneladas por hectare
  productivity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'productivity'
  },
  // Área plantada em hectares
  plantedArea: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    field: 'planted_area'
  },
  // Produção total em toneladas
  totalProduction: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'total_production'
  },
  // Rendimento médio histórico (5 anos)
  historicalAverage: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'historical_average'
  },
  // Variação percentual em relação à média histórica
  variationFromAverage: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'variation_from_average'
  },
  // Índice de qualidade do solo (0-100)
  soilQualityIndex: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'soil_quality_index'
  },
  // Índice de adequação climática (0-100)
  climateSuitabilityIndex: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'climate_suitability_index'
  },
  // Tecnologia utilizada
  technologyLevel: {
    type: DataTypes.ENUM('baixa', 'media', 'alta', 'precisao'),
    field: 'technology_level'
  },
  // Uso de irrigação
  irrigationUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'irrigation_used'
  },
  // Uso de fertilizantes (kg/ha)
  fertilizerUsage: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'fertilizer_usage'
  },
  // Uso de defensivos (l/ha)
  pesticideUsage: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'pesticide_usage'
  },
  // Custo de produção por hectare
  productionCostPerHectare: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'production_cost_per_hectare'
  },
  // Receita por hectare
  revenuePerHectare: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'revenue_per_hectare'
  },
  // Lucro por hectare
  profitPerHectare: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'profit_per_hectare'
  },
  // Fonte dos dados
  dataSource: {
    type: DataTypes.ENUM('ibge', 'conab', 'embrapa', 'usuario', 'satelite', 'outros'),
    allowNull: false,
    field: 'data_source'
  },
  // Confiabilidade dos dados (0-100)
  dataReliability: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 100,
    field: 'data_reliability'
  },
  // Observações adicionais
  observations: {
    type: DataTypes.TEXT,
    field: 'observations'
  },
  // Status dos dados
  status: {
    type: DataTypes.ENUM('preliminar', 'confirmado', 'revisado', 'final'),
    defaultValue: 'preliminar',
    field: 'status'
  }
}, {
  tableName: 'productivity',
  timestamps: true,
  indexes: [
    {
      fields: ['geo_data_id']
    },
    {
      fields: ['year']
    },
    {
      fields: ['season']
    },
    {
      fields: ['period_ref']
    },
    {
      fields: ['crop_type']
    },
    {
      fields: ['year', 'crop_type']
    },
    {
      name: 'productivity_state_munkey_year_period_product_uidx',
      fields: ['state', 'municipality_key', 'year', 'period_ref', 'product_label'],
      unique: true
    },
    {
      fields: ['data_source']
    },
    {
      fields: ['status']
    },
    {
      fields: ['state']
    },
    {
      fields: ['municipality_key']
    }
  ]
});

Productivity.beforeValidate((row) => {
  const name = String(row.municipalityName || '').trim();
  if (name && (!row.municipalityKey || String(row.municipalityKey).trim() === '')) {
    row.municipalityKey = normalizeMunicipalityKey(name);
  }
  if (row.state && String(row.state).length > 2) {
    row.state = String(row.state).trim().toUpperCase().slice(0, 2);
  }
});

// Métodos de consulta específicos
Productivity.findByRegionAndYear = async function(region, year, cropType = null) {
  const whereClause = { year };
  if (cropType) whereClause.cropType = cropType;
  
  return await this.findAll({
    where: whereClause,
    include: [{
      model: sequelize.models.GeoData,
      where: { region, isActive: true }
    }],
    order: [['productivity', 'DESC']]
  });
};

Productivity.findByStateAndYear = async function(state, year, cropType = null) {
  const whereClause = { year };
  if (cropType) whereClause.cropType = cropType;
  
  return await this.findAll({
    where: whereClause,
    include: [{
      model: sequelize.models.GeoData,
      where: { state, isActive: true }
    }],
    order: [['productivity', 'DESC']]
  });
};

Productivity.getTimeSeries = async function(geoDataId, cropType, startYear, endYear, productLabel = null) {
  const where = {
    geoDataId,
    cropType,
    year: {
      [sequelize.Sequelize.Op.between]: [startYear, endYear]
    }
  };
  if (productLabel != null && String(productLabel).trim() !== '') {
    where.productLabel = String(productLabel).trim();
  }
  return await this.findAll({
    where,
    order: [['year', 'ASC']]
  });
};

Productivity.getTopProducers = async function(year, cropType, limit = 10) {
  return await this.findAll({
    where: { year, cropType },
    include: [{
      model: sequelize.models.GeoData,
      where: { isActive: true }
    }],
    order: [['productivity', 'DESC']],
    limit
  });
};

Productivity.getProductivityStats = async function(year, cropType = null) {
  const whereClause = { year };
  if (cropType) whereClause.cropType = cropType;
  
  const stats = await this.findAll({
    where: whereClause,
    attributes: [
      [sequelize.fn('AVG', sequelize.col('productivity')), 'avgProductivity'],
      [sequelize.fn('MAX', sequelize.col('productivity')), 'maxProductivity'],
      [sequelize.fn('MIN', sequelize.col('productivity')), 'minProductivity'],
      [sequelize.fn('STDDEV', sequelize.col('productivity')), 'stdDevProductivity'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalRecords']
    ],
    raw: true
  });
  
  return stats[0];
};

// Método para calcular variação em relação à média histórica (identifica o registo por id)
Productivity.calculateHistoricalVariation = async function(productivityId) {
  const currentYear = await this.findByPk(productivityId);
  if (!currentYear) return null;

  const { Op } = sequelize.Sequelize;
  const scope =
    currentYear.geoDataId != null
      ? { geoDataId: currentYear.geoDataId }
      : { state: currentYear.state, municipalityKey: currentYear.municipalityKey };

  const histWhere = {
    ...scope,
    cropType: currentYear.cropType,
    productLabel: currentYear.productLabel,
    year: { [Op.lt]: currentYear.year }
  };

  const historicalYears = await this.findAll({
    where: histWhere,
    order: [['year', 'DESC']],
    limit: 5
  });

  if (historicalYears.length === 0) return null;

  const historicalAverage =
    historicalYears.reduce((sum, record) => sum + parseFloat(record.productivity), 0) /
    historicalYears.length;

  const variation =
    ((parseFloat(currentYear.productivity) - historicalAverage) / historicalAverage) * 100;

  await currentYear.update({
    historicalAverage: historicalAverage,
    variationFromAverage: variation
  });

  return {
    current: parseFloat(currentYear.productivity),
    historical: historicalAverage,
    variation: variation
  };
};

module.exports = Productivity;
