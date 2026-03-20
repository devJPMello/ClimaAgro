const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GeoData = sequelize.define('GeoData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Nome da camada geográfica
  layerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'layer_name'
  },
  // Tipo de geometria (Point, LineString, Polygon, MultiPolygon)
  geometryType: {
    type: DataTypes.ENUM('Point', 'LineString', 'Polygon', 'MultiPolygon'),
    allowNull: false,
    field: 'geometry_type'
  },
  // Geometria PostGIS
  geom: {
    type: DataTypes.GEOMETRY('GEOMETRY', 4326),
    allowNull: false,
    field: 'geom'
  },
  // Propriedades do GeoJSON
  properties: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'properties'
  },
  // Metadados da camada
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'metadata'
  },
  // Categoria da camada
  category: {
    type: DataTypes.ENUM('municipality', 'state', 'region', 'microregion', 'weather_station', 'agricultural_zone', 'other'),
    allowNull: false,
    field: 'category'
  },
  // Nível administrativo
  adminLevel: {
    type: DataTypes.INTEGER,
    field: 'admin_level'
  },
  // Código IBGE (se aplicável)
  ibgeCode: {
    type: DataTypes.STRING(20),
    field: 'ibge_code'
  },
  // Nome do município/estado
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'name'
  },
  // Sigla do estado
  state: {
    type: DataTypes.STRING(2),
    field: 'state'
  },
  // Região do Brasil
  region: {
    type: DataTypes.STRING(50),
    field: 'region'
  },
  // Status da camada
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  // Versão da camada
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0',
    field: 'version'
  }
}, {
  tableName: 'geo_data',
  timestamps: true,
  indexes: [
    {
      fields: ['layer_name']
    },
    {
      fields: ['category']
    },
    {
      fields: ['name']
    },
    {
      fields: ['state']
    },
    {
      fields: ['region']
    },
    {
      fields: ['ibge_code']
    },
    {
      fields: ['is_active']
    },
    // Índice espacial GIST para consultas geoespaciais
    {
      fields: ['geom'],
      using: 'GIST'
    }
  ],
  hooks: {
    beforeSave: async (geoData) => {
      // Validar geometria se fornecida como GeoJSON
      if (geoData.geom && typeof geoData.geom === 'object' && geoData.geom.type) {
        // Converter GeoJSON para formato PostGIS se necessário
        if (geoData.geom.coordinates) {
          geoData.geom = {
            type: geoData.geom.type,
            coordinates: geoData.geom.coordinates
          };
        }
      }
    }
  }
});

// Métodos de consulta espacial
GeoData.findByRegion = async function(regionName) {
  return await this.findAll({
    where: { region: regionName, isActive: true },
    order: [['name', 'ASC']]
  });
};

GeoData.findByState = async function(stateCode) {
  return await this.findAll({
    where: { state: stateCode, isActive: true },
    order: [['name', 'ASC']]
  });
};

GeoData.findByCategory = async function(category) {
  return await this.findAll({
    where: { category, isActive: true },
    order: [['name', 'ASC']]
  });
};

GeoData.findByProximity = async function(latitude, longitude, radiusKm = 50) {
  const query = `
    SELECT *, 
      ST_Distance(
        ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'),
        ST_GeogFromText(ST_AsText(geom))
      ) / 1000 as distance_km
    FROM geo_data 
    WHERE is_active = true
      AND ST_DWithin(
        ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'),
        ST_GeogFromText(ST_AsText(geom)),
        :radius * 1000
      )
    ORDER BY distance_km ASC;
  `;
  
  return await sequelize.query(query, {
    replacements: { latitude, longitude, radius: radiusKm },
    type: sequelize.QueryTypes.SELECT
  });
};

GeoData.findByPolygonIntersection = async function(polygonWKT) {
  const query = `
    SELECT * FROM geo_data 
    WHERE is_active = true
      AND ST_Intersects(geom, ST_GeomFromText(:polygon, 4326));
  `;
  
  return await sequelize.query(query, {
    replacements: { polygon: polygonWKT },
    type: sequelize.QueryTypes.SELECT
  });
};

// Método para converter para GeoJSON
GeoData.prototype.toGeoJSON = function() {
  return {
    type: 'Feature',
    geometry: {
      type: this.geometryType,
      coordinates: this.geom.coordinates
    },
    properties: {
      id: this.id,
      name: this.name,
      state: this.state,
      region: this.region,
      category: this.category,
      adminLevel: this.adminLevel,
      ibgeCode: this.ibgeCode,
      ...this.properties
    }
  };
};

// Método estático para buscar todos os dados como FeatureCollection
GeoData.getAsFeatureCollection = async function(filters = {}) {
  const whereClause = { isActive: true, ...filters };
  const features = await this.findAll({ where: whereClause });
  
  return {
    type: 'FeatureCollection',
    features: features.map(feature => feature.toGeoJSON())
  };
};

module.exports = GeoData;
