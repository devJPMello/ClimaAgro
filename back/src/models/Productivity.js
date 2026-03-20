const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Productivity = sequelize.define('Productivity', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Referência ao GeoData
  geoDataId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'geo_data_id',
    references: {
      model: 'geo_data',
      key: 'id'
    }
  },
  // Ano da safra
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'year'
  },
  // Safra (ex: 2024/25)
  season: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'season'
  },
  // Tipo de cultura
  cropType: {
    type: DataTypes.ENUM('soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros'),
    allowNull: false,
    field: 'crop_type'
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
      fields: ['crop_type']
    },
    {
      fields: ['year', 'crop_type']
    },
    {
      fields: ['geo_data_id', 'year', 'crop_type'],
      unique: true
    },
    {
      fields: ['data_source']
    },
    {
      fields: ['status']
    }
  ]
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

Productivity.getTimeSeries = async function(geoDataId, cropType, startYear, endYear) {
  return await this.findAll({
    where: {
      geoDataId,
      cropType,
      year: {
        [sequelize.Sequelize.Op.between]: [startYear, endYear]
      }
    },
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

// Método para calcular variação em relação à média histórica
Productivity.calculateHistoricalVariation = async function(geoDataId, cropType, year) {
  const currentYear = await this.findOne({
    where: { geoDataId, cropType, year }
  });
  
  if (!currentYear) return null;
  
  const historicalYears = await this.findAll({
    where: {
      geoDataId,
      cropType,
      year: {
        [sequelize.Sequelize.Op.lt]: year
      }
    },
    order: [['year', 'DESC']],
    limit: 5
  });
  
  if (historicalYears.length === 0) return null;
  
  const historicalAverage = historicalYears.reduce((sum, record) => 
    sum + parseFloat(record.productivity), 0) / historicalYears.length;
  
  const variation = ((parseFloat(currentYear.productivity) - historicalAverage) / historicalAverage) * 100;
  
  // Atualizar o registro com a variação calculada
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
