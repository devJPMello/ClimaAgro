const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Weather = sequelize.define('Weather', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Localização
  locationName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'location_name'
  },
  locationState: {
    type: DataTypes.STRING(2),
    allowNull: false,
    field: 'location_state'
  },
  // Coordenadas geográficas
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false,
    validate: {
      min: -90,
      max: 90
    }
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false,
    validate: {
      min: -180,
      max: 180
    }
  },
  // Campo geoespacial PostGIS (Point)
  geom: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: false,
    field: 'geom'
  },
  // Dados administrativos
  municipality: {
    type: DataTypes.STRING(100),
    field: 'municipality'
  },
  region: {
    type: DataTypes.STRING(50),
    field: 'region'
  },
  microregion: {
    type: DataTypes.STRING(100),
    field: 'microregion'
  },
  // Temperatura
  temperatureCurrent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    field: 'temperature_current',
    validate: {
      min: -50,
      max: 60
    }
  },
  temperatureMin: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'temperature_min',
    validate: {
      min: -50,
      max: 60
    }
  },
  temperatureMax: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'temperature_max',
    validate: {
      min: -50,
      max: 60
    }
  },
  temperatureFeelsLike: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'temperature_feels_like'
  },
  // Umidade
  humidity: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  // Precipitação
  precipitationCurrent: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0,
    field: 'precipitation_current',
    validate: {
      min: 0
    }
  },
  precipitationLast24h: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0,
    field: 'precipitation_last_24h',
    validate: {
      min: 0
    }
  },
  precipitationLast7days: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0,
    field: 'precipitation_last_7days',
    validate: {
      min: 0
    }
  },
  precipitationLast30days: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0,
    field: 'precipitation_last_30days',
    validate: {
      min: 0
    }
  },
  // Vento
  windSpeed: {
    type: DataTypes.DECIMAL(6, 2),
    defaultValue: 0,
    field: 'wind_speed',
    validate: {
      min: 0
    }
  },
  windDirection: {
    type: DataTypes.INTEGER,
    field: 'wind_direction',
    validate: {
      min: 0,
      max: 360
    }
  },
  windGust: {
    type: DataTypes.DECIMAL(6, 2),
    field: 'wind_gust'
  },
  // Outros dados climáticos
  pressure: {
    type: DataTypes.DECIMAL(6, 2),
    validate: {
      min: 800,
      max: 1100
    }
  },
  visibility: {
    type: DataTypes.DECIMAL(8, 2),
    validate: {
      min: 0
    }
  },
  uvIndex: {
    type: DataTypes.DECIMAL(3, 1),
    field: 'uv_index',
    validate: {
      min: 0,
      max: 11
    }
  },
  // Condição climática
  conditionMain: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'condition_main'
  },
  conditionDescription: {
    type: DataTypes.STRING(200),
    field: 'condition_description'
  },
  conditionIcon: {
    type: DataTypes.STRING(20),
    field: 'condition_icon'
  },
  // Dados agrícolas
  soilMoisture: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'soil_moisture',
    validate: {
      min: 0,
      max: 100
    }
  },
  soilTemperature: {
    type: DataTypes.DECIMAL(5, 2),
    field: 'soil_temperature',
    validate: {
      min: -20,
      max: 50
    }
  },
  cropGrowthStage: {
    type: DataTypes.ENUM('planting', 'germination', 'vegetative', 'flowering', 'fruiting', 'harvest', 'dormant'),
    field: 'crop_growth_stage'
  },
  irrigationRecommendation: {
    type: DataTypes.ENUM('none', 'light', 'moderate', 'heavy'),
    field: 'irrigation_recommendation'
  },
  // Metadados
  dataSource: {
    type: DataTypes.ENUM('api', 'sensor', 'manual', 'simulated'),
    defaultValue: 'simulated',
    field: 'data_source'
  },
  dataTimestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'data_timestamp'
  },
  dataValidity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'data_validity'
  }
}, {
  tableName: 'weather_data',
  timestamps: true,
  indexes: [
    {
      fields: ['location_name', 'location_state']
    },
    {
      fields: ['latitude', 'longitude']
    },
    {
      fields: ['data_timestamp']
    },
    {
      fields: ['location_state', 'data_timestamp']
    },
    {
      fields: ['data_source']
    },
    {
      fields: ['municipality']
    },
    {
      fields: ['region']
    }
  ],
  hooks: {
    beforeSave: async (weather) => {
      // Sincronizar coordenadas com campo geoespacial
      if (weather.changed('latitude') || weather.changed('longitude')) {
        weather.geom = {
          type: 'Point',
          coordinates: [parseFloat(weather.longitude), parseFloat(weather.latitude)]
        };
      }
    },
    beforeCreate: async (weather) => {
      // Garantir que o campo geom seja criado
      if (!weather.geom && weather.latitude && weather.longitude) {
        weather.geom = {
          type: 'Point',
          coordinates: [parseFloat(weather.longitude), parseFloat(weather.latitude)]
        };
      }
    }
  }
});

// Método para verificar se os dados ainda são válidos
Weather.prototype.isDataValid = function() {
  const now = new Date();
  const dataAge = (now - this.dataTimestamp) / (1000 * 60 * 60); // em horas
  return dataAge <= this.dataValidity;
};

// Método para calcular sensação térmica
Weather.prototype.calculateFeelsLike = function() {
  const temp = parseFloat(this.temperatureCurrent);
  const humidity = parseFloat(this.humidity);
  const wind = parseFloat(this.windSpeed || 0);
  
  // Fórmula simplificada de sensação térmica
  if (temp >= 27 && humidity >= 40) {
    // Índice de calor
    const hi = temp + 0.5 * humidity - 0.01 * humidity * temp;
    return Math.round(hi);
  } else if (temp <= 10 && wind >= 4) {
    // Sensação de frio com vento
    const wc = temp - (wind * 0.7);
    return Math.round(wc);
  }
  
  return temp;
};

module.exports = Weather;
