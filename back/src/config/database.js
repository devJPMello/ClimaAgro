const { Sequelize } = require('sequelize');

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!dbUrl || typeof dbUrl !== 'string') {
  console.error(
    '❌ Defina DATABASE_URL ou POSTGRES_URL no arquivo back/.env (ou carregue o dotenv antes de importar database.js).'
  );
  process.exit(1);
}

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  process.env.NODE_ENV === 'production' ||
  (typeof dbUrl === 'string' &&
    (dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require')));

// Configuração do banco de dados PostgreSQL com PostGIS
const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: useSsl
      ? {
          require: true,
          rejectUnauthorized: false
        }
      : false
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

// Disponibilizar `sequelize` antes de `require` dos modelos (evita circular: database → User → database com exports ainda vazio).
module.exports.sequelize = sequelize;

async function ensureExternalMessageIdColumn() {
  const qi = sequelize.getQueryInterface();
  const tableDesc = await qi.describeTable('hybrid_messages').catch(() => null);
  if (!tableDesc) {
    console.log('ℹ️  Tabela hybrid_messages ainda não existe — será criada pelo sync.');
    return;
  }
  if (tableDesc.external_message_id) {
    return; // coluna já existe
  }
  console.log('⚙️  Criando coluna external_message_id em hybrid_messages...');
  const { DataTypes } = require('sequelize');
  await qi.addColumn('hybrid_messages', 'external_message_id', {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
  });
  console.log('✅ Coluna external_message_id criada com sucesso.');
}

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

    // Migração: garante coluna external_message_id em hybrid_messages (todos os ambientes)
    await ensureExternalMessageIdColumn();
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
const GeoData = require('../models/GeoData');
const Productivity = require('../models/Productivity');
const ClimateData = require('../models/ClimateData');
const OfficialAlert = require('../models/OfficialAlert');
const ReportExport = require('../models/ReportExport');
const IbgeSidra1612Row = require('../models/IbgeSidra1612Row');
const ChatHistory = require('../models/ChatHistory');
const DualUserProfile = require('../models/DualUserProfile');
const ConsultaAgronomica = require('../models/ConsultaAgronomica');
const HybridConversation = require('../models/HybridConversation');
const HybridMessage = require('../models/HybridMessage');

// Configurar associações entre modelos
const setupAssociations = () => {
  // GeoData tem muitos Productivity
  GeoData.hasMany(Productivity, { foreignKey: 'geoDataId', as: 'productivity' });
  Productivity.belongsTo(GeoData, { foreignKey: 'geoDataId', as: 'geoData' });

  GeoData.hasMany(IbgeSidra1612Row, { foreignKey: 'geoDataId', as: 'ibgeSidra1612Rows' });
  IbgeSidra1612Row.belongsTo(GeoData, { foreignKey: 'geoDataId', as: 'geoData' });

  // GeoData tem muitos ClimateData
  GeoData.hasMany(ClimateData, { foreignKey: 'geoDataId', as: 'climateData' });
  ClimateData.belongsTo(GeoData, { foreignKey: 'geoDataId', as: 'geoData' });

  // Report/Alert em models/ ainda são esquemas Mongoose legados — não associar aqui ao Sequelize.

  HybridConversation.hasMany(HybridMessage, { foreignKey: 'conversationId', as: 'messages' });
  HybridMessage.belongsTo(HybridConversation, { foreignKey: 'conversationId', as: 'conversation' });

  ConsultaAgronomica.hasMany(HybridConversation, {
    foreignKey: 'consultaAgronomicaId',
    as: 'hybridConversations',
  });
  HybridConversation.belongsTo(ConsultaAgronomica, {
    foreignKey: 'consultaAgronomicaId',
    as: 'consulta',
  });
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
    GeoData,
    Productivity,
    ClimateData,
    OfficialAlert,
    ReportExport,
    IbgeSidra1612Row,
    ChatHistory,
    DualUserProfile,
    ConsultaAgronomica,
    HybridConversation,
    HybridMessage
  }
};
