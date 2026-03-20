const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClimateData = sequelize.define('ClimateData', {
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
  // Data da medição
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'date'
  },
  // Ano
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'year'
  },
  // Mês
  month: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'month'
  },
  // Dia
  day: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'day'
  },
  // Temperatura média em Celsius
  avgTemperature: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'avg_temperature'
  },
  // Temperatura máxima em Celsius
  maxTemperature: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'max_temperature'
  },
  // Temperatura mínima em Celsius
  minTemperature: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'min_temperature'
  },
  // Precipitação em mm
  precipitation: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'precipitation'
  },
  // Umidade relativa do ar em %
  humidity: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'humidity'
  },
  // Velocidade do vento em km/h
  windSpeed: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'wind_speed'
  },
  // Direção do vento em graus
  windDirection: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'wind_direction'
  },
  // Pressão atmosférica em hPa
  atmosphericPressure: {
    type: DataTypes.DECIMAL(7, 2),
    field: 'atmospheric_pressure'
  },
  // Radiação solar em MJ/m²
  solarRadiation: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'solar_radiation'
  },
  // Evapotranspiração em mm
  evapotranspiration: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'evapotranspiration'
  },
  // Índice de estresse hídrico (0-100)
  waterStressIndex: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'water_stress_index'
  },
  // Índice de adequação climática para agricultura (0-100)
  climateSuitabilityIndex: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'climate_suitability_index'
  },
  // Número de dias sem chuva
  consecutiveDryDays: {
    type: DataTypes.INTEGER,
    field: 'consecutive_dry_days'
  },
  // Número de dias com chuva
  rainyDays: {
    type: DataTypes.INTEGER,
    field: 'rainy_days'
  },
  // Precipitação acumulada no mês em mm
  monthlyPrecipitation: {
    type: DataTypes.DECIMAL(8, 2),
    field: 'monthly_precipitation'
  },
  // Temperatura média do mês em Celsius
  monthlyAvgTemperature: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'monthly_avg_temperature'
  },
  // Fonte dos dados
  dataSource: {
    type: DataTypes.ENUM('inmet', 'cptec', 'nasa', 'noaa', 'usuario', 'satelite', 'outros'),
    allowNull: false,
    field: 'data_source'
  },
  // Estação meteorológica
  weatherStation: {
    type: DataTypes.STRING(100),
    field: 'weather_station'
  },
  // Código da estação meteorológica
  stationCode: {
    type: DataTypes.STRING(20),
    field: 'station_code'
  },
  // Qualidade dos dados (0-100)
  dataQuality: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 100,
    field: 'data_quality'
  },
  // Status dos dados
  status: {
    type: DataTypes.ENUM('preliminar', 'confirmado', 'revisado', 'final'),
    defaultValue: 'preliminar',
    field: 'status'
  }
}, {
  tableName: 'climate_data',
  timestamps: true,
  indexes: [
    {
      fields: ['geo_data_id']
    },
    {
      fields: ['date']
    },
    {
      fields: ['year']
    },
    {
      fields: ['month']
    },
    {
      fields: ['year', 'month']
    },
    {
      fields: ['geo_data_id', 'date'],
      unique: true
    },
    {
      fields: ['data_source']
    },
    {
      fields: ['weather_station']
    },
    {
      fields: ['status']
    }
  ]
});

// Métodos de consulta específicos
ClimateData.findByRegionAndDateRange = async function(region, startDate, endDate) {
  return await this.findAll({
    where: {
      date: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    },
    include: [{
      model: sequelize.models.GeoData,
      where: { region, isActive: true }
    }],
    order: [['date', 'ASC']]
  });
};

ClimateData.findByStateAndDateRange = async function(state, startDate, endDate) {
  return await this.findAll({
    where: {
      date: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    },
    include: [{
      model: sequelize.models.GeoData,
      where: { state, isActive: true }
    }],
    order: [['date', 'ASC']]
  });
};

ClimateData.getMonthlyAverages = async function(geoDataId, year) {
  return await this.findAll({
    where: { geoDataId, year },
    attributes: [
      'month',
      [sequelize.fn('AVG', sequelize.col('avgTemperature')), 'avgTemperature'],
      [sequelize.fn('AVG', sequelize.col('maxTemperature')), 'avgMaxTemperature'],
      [sequelize.fn('AVG', sequelize.col('minTemperature')), 'avgMinTemperature'],
      [sequelize.fn('SUM', sequelize.col('precipitation')), 'totalPrecipitation'],
      [sequelize.fn('AVG', sequelize.col('humidity')), 'avgHumidity'],
      [sequelize.fn('AVG', sequelize.col('windSpeed')), 'avgWindSpeed'],
      [sequelize.fn('AVG', sequelize.col('solarRadiation')), 'avgSolarRadiation'],
      [sequelize.fn('AVG', sequelize.col('evapotranspiration')), 'avgEvapotranspiration']
    ],
    group: ['month'],
    order: [['month', 'ASC']],
    raw: true
  });
};

ClimateData.getYearlyAverages = async function(geoDataId, startYear, endYear) {
  return await this.findAll({
    where: {
      geoDataId,
      year: {
        [sequelize.Sequelize.Op.between]: [startYear, endYear]
      }
    },
    attributes: [
      'year',
      [sequelize.fn('AVG', sequelize.col('avgTemperature')), 'avgTemperature'],
      [sequelize.fn('AVG', sequelize.col('maxTemperature')), 'avgMaxTemperature'],
      [sequelize.fn('AVG', sequelize.col('minTemperature')), 'avgMinTemperature'],
      [sequelize.fn('SUM', sequelize.col('precipitation')), 'totalPrecipitation'],
      [sequelize.fn('AVG', sequelize.col('humidity')), 'avgHumidity'],
      [sequelize.fn('AVG', sequelize.col('windSpeed')), 'avgWindSpeed'],
      [sequelize.fn('AVG', sequelize.col('solarRadiation')), 'avgSolarRadiation'],
      [sequelize.fn('AVG', sequelize.col('evapotranspiration')), 'avgEvapotranspiration']
    ],
    group: ['year'],
    order: [['year', 'ASC']],
    raw: true
  });
};

ClimateData.getClimateStats = async function(geoDataId, startDate, endDate) {
  const stats = await this.findAll({
    where: {
      geoDataId,
      date: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('avgTemperature')), 'avgTemperature'],
      [sequelize.fn('MAX', sequelize.col('maxTemperature')), 'maxTemperature'],
      [sequelize.fn('MIN', sequelize.col('minTemperature')), 'minTemperature'],
      [sequelize.fn('SUM', sequelize.col('precipitation')), 'totalPrecipitation'],
      [sequelize.fn('AVG', sequelize.col('precipitation')), 'avgPrecipitation'],
      [sequelize.fn('AVG', sequelize.col('humidity')), 'avgHumidity'],
      [sequelize.fn('AVG', sequelize.col('windSpeed')), 'avgWindSpeed'],
      [sequelize.fn('AVG', sequelize.col('solarRadiation')), 'avgSolarRadiation'],
      [sequelize.fn('AVG', sequelize.col('evapotranspiration')), 'avgEvapotranspiration'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalDays']
    ],
    raw: true
  });
  
  return stats[0];
};

ClimateData.getExtremeEvents = async function(geoDataId, startDate, endDate) {
  // Buscar eventos extremos de temperatura e precipitação
  const extremeTemp = await this.findAll({
    where: {
      geoDataId,
      date: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      },
      [sequelize.Sequelize.Op.or]: [
        { maxTemperature: { [sequelize.Sequelize.Op.gte]: 35 } }, // Temperatura muito alta
        { minTemperature: { [sequelize.Sequelize.Op.lte]: 5 } }    // Temperatura muito baixa
      ]
    },
    order: [['date', 'ASC']]
  });

  const extremePrecip = await this.findAll({
    where: {
      geoDataId,
      date: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      },
      precipitation: { [sequelize.Sequelize.Op.gte]: 50 } // Chuva intensa
    },
    order: [['date', 'ASC']]
  });

  return {
    extremeTemperatures: extremeTemp,
    extremePrecipitation: extremePrecip
  };
};

module.exports = ClimateData;
