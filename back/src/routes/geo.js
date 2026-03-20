const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const { spatialQueries } = require('../config/database');
const GeoData = require('../models/GeoData');
const Weather = require('../models/Weather');

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(protect);

// @route   GET /api/geo/regions
// @desc    Buscar todas as regiões
// @access  Private
router.get('/regions', async (req, res) => {
  try {
    const regions = await GeoData.findAll({
      where: { 
        category: 'region',
        isActive: true 
      },
      attributes: ['id', 'name', 'region', 'properties'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      count: regions.length,
      data: regions
    });
  } catch (error) {
    console.error('Erro ao buscar regiões:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/states
// @desc    Buscar todos os estados
// @access  Private
router.get('/states', async (req, res) => {
  try {
    const states = await GeoData.findAll({
      where: { 
        category: 'state',
        isActive: true 
      },
      attributes: ['id', 'name', 'state', 'region', 'properties'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      count: states.length,
      data: states
    });
  } catch (error) {
    console.error('Erro ao buscar estados:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/municipalities
// @desc    Buscar municípios por estado ou região
// @access  Private
router.get('/municipalities', [
  query('state').optional().isLength({ min: 2, max: 2 }).withMessage('Estado deve ter 2 caracteres'),
  query('region').optional().isLength({ min: 2 }).withMessage('Região inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { state, region } = req.query;
    const whereClause = { 
      category: 'municipality',
      isActive: true 
    };

    if (state) whereClause.state = state.toUpperCase();
    if (region) whereClause.region = region;

    const municipalities = await GeoData.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'state', 'region', 'ibgeCode', 'properties'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      count: municipalities.length,
      data: municipalities
    });
  } catch (error) {
    console.error('Erro ao buscar municípios:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/feature-collection
// @desc    Buscar dados como FeatureCollection GeoJSON
// @access  Private
router.get('/feature-collection', [
  query('category').optional().isIn(['municipality', 'state', 'region', 'microregion', 'weather_station', 'agricultural_zone']),
  query('state').optional().isLength({ min: 2, max: 2 }),
  query('region').optional().isLength({ min: 2 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { category, state, region } = req.query;
    const filters = {};

    if (category) filters.category = category;
    if (state) filters.state = state.toUpperCase();
    if (region) filters.region = region;

    const featureCollection = await GeoData.getAsFeatureCollection(filters);

    res.json({
      success: true,
      data: featureCollection
    });
  } catch (error) {
    console.error('Erro ao buscar FeatureCollection:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/proximity
// @desc    Buscar dados por proximidade
// @access  Private
router.get('/proximity', [
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude inválida'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude inválida'),
  query('radius').optional().isFloat({ min: 0.1, max: 1000 }).withMessage('Raio deve estar entre 0.1 e 1000 km')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { lat, lng, radius = 50 } = req.query;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    const data = await spatialQueries.findByProximity(latitude, longitude, radiusKm);

    res.json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (error) {
    console.error('Erro ao buscar por proximidade:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/geo/polygon-search
// @desc    Buscar dados dentro de um polígono
// @access  Private
router.post('/polygon-search', [
  body('polygon').isString().withMessage('Polígono WKT é obrigatório'),
  body('type').optional().isIn(['weather', 'geo']).withMessage('Tipo deve ser weather ou geo')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { polygon, type = 'weather' } = req.body;

    let data;
    if (type === 'weather') {
      data = await spatialQueries.findByPolygon(polygon);
    } else {
      data = await GeoData.findByPolygonIntersection(polygon);
    }

    res.json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (error) {
    console.error('Erro ao buscar por polígono:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/regional-stats
// @desc    Calcular estatísticas por região
// @access  Private
router.get('/regional-stats', [
  query('region').isString().withMessage('Região é obrigatória')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { region } = req.query;

    // Buscar polígono da região
    const regionData = await GeoData.findOne({
      where: { 
        category: 'region',
        name: region,
        isActive: true 
      }
    });

    if (!regionData) {
      return res.status(404).json({
        success: false,
        message: 'Região não encontrada'
      });
    }

    // Converter geometria para WKT
    const polygonWKT = `POLYGON((${regionData.geom.coordinates[0].map(coord => `${coord[0]} ${coord[1]}`).join(', ')}))`;
    
    const stats = await spatialQueries.getRegionalStats(polygonWKT);

    res.json({
      success: true,
      data: {
        region: region,
        stats: stats[0] || {}
      }
    });
  } catch (error) {
    console.error('Erro ao calcular estatísticas regionais:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/geo/weather-stations
// @desc    Buscar estações meteorológicas
// @access  Private
router.get('/weather-stations', [
  query('state').optional().isLength({ min: 2, max: 2 }),
  query('region').optional().isLength({ min: 2 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { state, region } = req.query;
    const whereClause = { 
      category: 'weather_station',
      isActive: true 
    };

    if (state) whereClause.state = state.toUpperCase();
    if (region) whereClause.region = region;

    const stations = await GeoData.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'state', 'region', 'properties', 'geom'],
      order: [['name', 'ASC']]
    });

    // Converter para GeoJSON
    const featureCollection = {
      type: 'FeatureCollection',
      features: stations.map(station => station.toGeoJSON())
    };

    res.json({
      success: true,
      count: stations.length,
      data: featureCollection
    });
  } catch (error) {
    console.error('Erro ao buscar estações meteorológicas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/geo/intersection
// @desc    Buscar dados por interseção com GeoJSON
// @access  Private
router.post('/intersection', [
  body('geoJSON').isObject().withMessage('GeoJSON é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { geoJSON } = req.body;

    const data = await spatialQueries.findByGeoJSONIntersection(geoJSON);

    res.json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (error) {
    console.error('Erro ao buscar por interseção:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
