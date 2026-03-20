const { Sequelize } = require('sequelize');

// Configuração do banco de dados PostgreSQL com PostGIS
const sequelize = new Sequelize(process.env.DATABASE_URL || process.env.POSTGRES_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    underscored: true,
    freezeTableName: true
  }
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL conectado com sucesso');
    
    // Verificar se PostGIS está instalado
    const [results] = await sequelize.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'postgis'
      ) as postgis_installed;
    `);
    
    if (!results[0].postgis_installed) {
      console.log('⚠️  PostGIS não encontrado. Instalando...');
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
      console.log('✅ PostGIS instalado com sucesso');
    } else {
      console.log('✅ PostGIS já está instalado');
    }
    
    // Sincronizar modelos (apenas em desenvolvimento)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Modelos sincronizados');
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com PostgreSQL:', error.message);
    process.exit(1);
  }
};

// Funções de consulta espacial
const spatialQueries = {
  // Buscar dados por proximidade
  findByProximity: async (latitude, longitude, radiusKm = 50) => {
    const query = `
      SELECT *, 
        ST_Distance(
          ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'),
          ST_GeogFromText('POINT(' || longitude || ' ' || latitude || ')')
        ) / 1000 as distance_km
      FROM weather_data 
      WHERE ST_DWithin(
        ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'),
        ST_GeogFromText('POINT(' || longitude || ' ' || latitude || ')'),
        :radius * 1000
      )
      ORDER BY distance_km ASC;
    `;
    
    return await sequelize.query(query, {
      replacements: { latitude, longitude, radius: radiusKm },
      type: Sequelize.QueryTypes.SELECT
    });
  },

  // Buscar dados dentro de um polígono (município/região)
  findByPolygon: async (polygonWKT) => {
    const query = `
      SELECT * FROM weather_data 
      WHERE ST_Within(
        ST_GeogFromText('POINT(' || longitude || ' ' || latitude || ')'),
        ST_GeogFromText(:polygon)
      );
    `;
    
    return await sequelize.query(query, {
      replacements: { polygon: polygonWKT },
      type: Sequelize.QueryTypes.SELECT
    });
  },

  // Buscar dados por interseção com GeoJSON
  findByGeoJSONIntersection: async (geoJSON) => {
    const query = `
      SELECT * FROM weather_data 
      WHERE ST_Intersects(
        ST_GeogFromText('POINT(' || longitude || ' ' || latitude || ')'),
        ST_GeogFromText(:geoJSON)
      );
    `;
    
    return await sequelize.query(query, {
      replacements: { geoJSON: JSON.stringify(geoJSON) },
      type: Sequelize.QueryTypes.SELECT
    });
  },

  // Calcular estatísticas por região
  getRegionalStats: async (regionPolygon) => {
    const query = `
      SELECT 
        AVG(temperature_current) as avg_temperature,
        MIN(temperature_current) as min_temperature,
        MAX(temperature_current) as max_temperature,
        AVG(humidity) as avg_humidity,
        SUM(precipitation_last_24h) as total_precipitation,
        COUNT(*) as data_points
      FROM weather_data 
      WHERE ST_Within(
        ST_GeogFromText('POINT(' || longitude || ' ' || latitude || ')'),
        ST_GeogFromText(:polygon)
      );
    `;
    
    return await sequelize.query(query, {
      replacements: { polygon: regionPolygon },
      type: Sequelize.QueryTypes.SELECT
    });
  }
};

// Importar e configurar modelos
const User = require('../models/User');
const Weather = require('../models/Weather');
const Alert = require('../models/Alert');
const Report = require('../models/Report');
const GeoData = require('../models/GeoData');
const Productivity = require('../models/Productivity');
const ClimateData = require('../models/ClimateData');

// Configurar associações entre modelos
const setupAssociations = () => {
  // GeoData tem muitos Productivity
  GeoData.hasMany(Productivity, { foreignKey: 'geoDataId', as: 'productivity' });
  Productivity.belongsTo(GeoData, { foreignKey: 'geoDataId', as: 'geoData' });

  // GeoData tem muitos ClimateData
  GeoData.hasMany(ClimateData, { foreignKey: 'geoDataId', as: 'climateData' });
  ClimateData.belongsTo(GeoData, { foreignKey: 'geoDataId', as: 'geoData' });

  // User tem muitos Reports
  User.hasMany(Report, { foreignKey: 'userId', as: 'reports' });
  Report.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User tem muitos Alerts
  User.hasMany(Alert, { foreignKey: 'userId', as: 'alerts' });
  Alert.belongsTo(User, { foreignKey: 'userId', as: 'user' });
};

// Configurar associações
setupAssociations();

module.exports = { 
  sequelize, 
  connectDB, 
  spatialQueries,
  models: {
    User,
    Weather,
    Alert,
    Report,
    GeoData,
    Productivity,
    ClimateData
  }
};
