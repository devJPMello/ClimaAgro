const express = require('express');
const router = express.Router();
const { models } = require('../config/database');
const { Productivity, GeoData, ClimateData } = models;
const { validationResult } = require('express-validator');
const { body, query, param } = require('express-validator');

// Middleware de validação
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/productivity - Listar dados de produtividade com filtros
router.get('/', [
  query('year').optional().isInt({ min: 2000, max: 2030 }),
  query('cropType').optional().isIn(['soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros']),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], async (req, res) => {
  try {
    const { year, cropType, region, state, limit = 50, offset = 0 } = req.query;
    
    const whereClause = {};
    const includeWhere = { isActive: true };
    
    if (year) whereClause.year = year;
    if (cropType) whereClause.cropType = cropType;
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
    
    const productivity = await Productivity.findAndCountAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere
      }],
      order: [['productivity', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: productivity.rows,
      pagination: {
        total: productivity.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(productivity.count / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/geojson - Obter dados de produtividade como GeoJSON
router.get('/geojson', [
  query('year').isInt({ min: 2000, max: 2030 }),
  query('cropType').optional().isIn(['soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros']),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const { year, cropType, region, state } = req.query;
    
    const whereClause = { year };
    const includeWhere = { isActive: true };
    
    if (cropType) whereClause.cropType = cropType;
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
    
    const productivity = await Productivity.findAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere
      }]
    });
    
    // Converter para GeoJSON
    const features = productivity.map(record => {
      const geoData = record.geoData;
      return {
        type: 'Feature',
        geometry: {
          type: geoData.geometryType,
          coordinates: geoData.geom.coordinates
        },
        properties: {
          id: record.id,
          name: geoData.name,
          state: geoData.state,
          region: geoData.region,
          year: record.year,
          season: record.season,
          cropType: record.cropType,
          productivity: parseFloat(record.productivity),
          plantedArea: parseFloat(record.plantedArea),
          totalProduction: parseFloat(record.totalProduction),
          historicalAverage: record.historicalAverage ? parseFloat(record.historicalAverage) : null,
          variationFromAverage: record.variationFromAverage ? parseFloat(record.variationFromAverage) : null,
          soilQualityIndex: record.soilQualityIndex ? parseFloat(record.soilQualityIndex) : null,
          climateSuitabilityIndex: record.climateSuitabilityIndex ? parseFloat(record.climateSuitabilityIndex) : null,
          technologyLevel: record.technologyLevel,
          irrigationUsed: record.irrigationUsed,
          dataSource: record.dataSource,
          dataReliability: record.dataReliability ? parseFloat(record.dataReliability) : null
        }
      };
    });
    
    const geojson = {
      type: 'FeatureCollection',
      features: features
    };
    
    res.json({
      success: true,
      data: geojson
    });
  } catch (error) {
    console.error('Erro ao gerar GeoJSON de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/timeseries - Obter série temporal de produtividade
router.get('/timeseries', [
  query('geoDataId').isUUID(),
  query('cropType').isIn(['soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros']),
  query('startYear').isInt({ min: 2000, max: 2030 }),
  query('endYear').isInt({ min: 2000, max: 2030 }),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, cropType, startYear, endYear } = req.query;
    
    const timeSeries = await Productivity.getTimeSeries(geoDataId, cropType, startYear, endYear);
    
    // Buscar dados climáticos para o mesmo período
    const climateData = await ClimateData.getYearlyAverages(geoDataId, startYear, endYear);
    
    res.json({
      success: true,
      data: {
        productivity: timeSeries.map(record => ({
          year: record.year,
          season: record.season,
          productivity: parseFloat(record.productivity),
          plantedArea: parseFloat(record.plantedArea),
          totalProduction: parseFloat(record.totalProduction),
          historicalAverage: record.historicalAverage ? parseFloat(record.historicalAverage) : null,
          variationFromAverage: record.variationFromAverage ? parseFloat(record.variationFromAverage) : null
        })),
        climate: climateData.map(record => ({
          year: record.year,
          avgTemperature: parseFloat(record.avgTemperature),
          avgMaxTemperature: parseFloat(record.avgMaxTemperature),
          avgMinTemperature: parseFloat(record.avgMinTemperature),
          totalPrecipitation: parseFloat(record.totalPrecipitation),
          avgHumidity: parseFloat(record.avgHumidity),
          avgWindSpeed: parseFloat(record.avgWindSpeed),
          avgSolarRadiation: parseFloat(record.avgSolarRadiation),
          avgEvapotranspiration: parseFloat(record.avgEvapotranspiration)
        }))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar série temporal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/stats - Obter estatísticas de produtividade
router.get('/stats', [
  query('year').isInt({ min: 2000, max: 2030 }),
  query('cropType').optional().isIn(['soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros']),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const { year, cropType, region, state } = req.query;
    
    const whereClause = { year };
    const includeWhere = { isActive: true };
    
    if (cropType) whereClause.cropType = cropType;
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
    
    const stats = await Productivity.getProductivityStats(year, cropType);
    
    // Buscar top produtores
    const topProducers = await Productivity.getTopProducers(year, cropType, 10);
    
    res.json({
      success: true,
      data: {
        statistics: {
          avgProductivity: parseFloat(stats.avgProductivity),
          maxProductivity: parseFloat(stats.maxProductivity),
          minProductivity: parseFloat(stats.minProductivity),
          stdDevProductivity: parseFloat(stats.stdDevProductivity),
          totalRecords: parseInt(stats.totalRecords)
        },
        topProducers: topProducers.map(record => ({
          name: record.geoData.name,
          state: record.geoData.state,
          region: record.geoData.region,
          productivity: parseFloat(record.productivity),
          plantedArea: parseFloat(record.plantedArea),
          totalProduction: parseFloat(record.totalProduction)
        }))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/:id - Obter dados específicos de produtividade
router.get('/:id', [
  param('id').isUUID(),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const productivity = await Productivity.findByPk(id, {
      include: [{
        model: GeoData,
        as: 'geoData'
      }]
    });
    
    if (!productivity) {
      return res.status(404).json({
        success: false,
        message: 'Dados de produtividade não encontrados'
      });
    }
    
    res.json({
      success: true,
      data: productivity
    });
  } catch (error) {
    console.error('Erro ao buscar dados de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/productivity - Criar novos dados de produtividade
router.post('/', [
  body('geoDataId').isUUID(),
  body('year').isInt({ min: 2000, max: 2030 }),
  body('season').isString().isLength({ min: 1, max: 10 }),
  body('cropType').isIn(['soja', 'milho', 'cafe', 'cana', 'algodao', 'trigo', 'arroz', 'feijao', 'outros']),
  body('productivity').isDecimal(),
  body('plantedArea').isDecimal(),
  body('totalProduction').isDecimal(),
  body('dataSource').isIn(['ibge', 'conab', 'embrapa', 'usuario', 'satelite', 'outros']),
  validateRequest
], async (req, res) => {
  try {
    const productivityData = req.body;
    
    // Verificar se já existe dados para a mesma região, ano e cultura
    const existing = await Productivity.findOne({
      where: {
        geoDataId: productivityData.geoDataId,
        year: productivityData.year,
        cropType: productivityData.cropType
      }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Já existem dados de produtividade para esta região, ano e cultura'
      });
    }
    
    const productivity = await Productivity.create(productivityData);
    
    // Calcular variação histórica
    await Productivity.calculateHistoricalVariation(
      productivity.geoDataId, 
      productivity.cropType, 
      productivity.year
    );
    
    res.status(201).json({
      success: true,
      data: productivity,
      message: 'Dados de produtividade criados com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar dados de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /api/productivity/:id - Atualizar dados de produtividade
router.put('/:id', [
  param('id').isUUID(),
  body('productivity').optional().isDecimal(),
  body('plantedArea').optional().isDecimal(),
  body('totalProduction').optional().isDecimal(),
  body('soilQualityIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('climateSuitabilityIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('technologyLevel').optional().isIn(['baixa', 'media', 'alta', 'precisao']),
  body('irrigationUsed').optional().isBoolean(),
  body('fertilizerUsage').optional().isDecimal(),
  body('pesticideUsage').optional().isDecimal(),
  body('productionCostPerHectare').optional().isDecimal(),
  body('revenuePerHectare').optional().isDecimal(),
  body('profitPerHectare').optional().isDecimal(),
  body('dataReliability').optional().isDecimal({ min: 0, max: 100 }),
  body('observations').optional().isString(),
  body('status').optional().isIn(['preliminar', 'confirmado', 'revisado', 'final']),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const productivity = await Productivity.findByPk(id);
    
    if (!productivity) {
      return res.status(404).json({
        success: false,
        message: 'Dados de produtividade não encontrados'
      });
    }
    
    await productivity.update(updateData);
    
    // Recalcular variação histórica se necessário
    if (updateData.productivity) {
      await Productivity.calculateHistoricalVariation(
        productivity.geoDataId, 
        productivity.cropType, 
        productivity.year
      );
    }
    
    res.json({
      success: true,
      data: productivity,
      message: 'Dados de produtividade atualizados com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar dados de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/productivity/:id - Excluir dados de produtividade
router.delete('/:id', [
  param('id').isUUID(),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const productivity = await Productivity.findByPk(id);
    
    if (!productivity) {
      return res.status(404).json({
        success: false,
        message: 'Dados de produtividade não encontrados'
      });
    }
    
    await productivity.destroy();
    
    res.json({
      success: true,
      message: 'Dados de produtividade excluídos com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir dados de produtividade:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
