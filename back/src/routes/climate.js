const express = require('express');
const router = express.Router();
const { models } = require('../config/database');
const { ClimateData, GeoData } = models;
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

// GET /api/climate - Listar dados climáticos com filtros
router.get('/', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], async (req, res) => {
  try {
    const { startDate, endDate, region, state, limit = 100, offset = 0 } = req.query;
    
    const whereClause = {};
    const includeWhere = { isActive: true };
    
    if (startDate && endDate) {
      whereClause.date = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
    
    const climateData = await ClimateData.findAndCountAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere
      }],
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: climateData.rows,
      pagination: {
        total: climateData.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(climateData.count / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/climate/timeseries - Obter série temporal de dados climáticos
router.get('/timeseries', [
  query('geoDataId').isUUID(),
  query('startDate').isISO8601(),
  query('endDate').isISO8601(),
  query('granularity').optional().isIn(['daily', 'monthly', 'yearly']),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, startDate, endDate, granularity = 'daily' } = req.query;
    
    let timeSeries;
    
    if (granularity === 'monthly') {
      timeSeries = await ClimateData.getMonthlyAverages(geoDataId, new Date(startDate).getFullYear());
    } else if (granularity === 'yearly') {
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(endDate).getFullYear();
      timeSeries = await ClimateData.getYearlyAverages(geoDataId, startYear, endYear);
    } else {
      timeSeries = await ClimateData.findByRegionAndDateRange(null, startDate, endDate);
    }
    
    res.json({
      success: true,
      data: timeSeries.map(record => ({
        date: record.date || `${record.year}-${record.month ? record.month.toString().padStart(2, '0') : '01'}-01`,
        year: record.year,
        month: record.month,
        avgTemperature: record.avgTemperature ? parseFloat(record.avgTemperature) : null,
        maxTemperature: record.maxTemperature ? parseFloat(record.maxTemperature) : null,
        minTemperature: record.minTemperature ? parseFloat(record.minTemperature) : null,
        precipitation: record.precipitation ? parseFloat(record.precipitation) : null,
        humidity: record.humidity ? parseFloat(record.humidity) : null,
        windSpeed: record.windSpeed ? parseFloat(record.windSpeed) : null,
        windDirection: record.windDirection ? parseFloat(record.windDirection) : null,
        atmosphericPressure: record.atmosphericPressure ? parseFloat(record.atmosphericPressure) : null,
        solarRadiation: record.solarRadiation ? parseFloat(record.solarRadiation) : null,
        evapotranspiration: record.evapotranspiration ? parseFloat(record.evapotranspiration) : null,
        waterStressIndex: record.waterStressIndex ? parseFloat(record.waterStressIndex) : null,
        climateSuitabilityIndex: record.climateSuitabilityIndex ? parseFloat(record.climateSuitabilityIndex) : null
      }))
    });
  } catch (error) {
    console.error('Erro ao buscar série temporal climática:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/climate/stats - Obter estatísticas climáticas
router.get('/stats', [
  query('geoDataId').isUUID(),
  query('startDate').isISO8601(),
  query('endDate').isISO8601(),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, startDate, endDate } = req.query;
    
    const stats = await ClimateData.getClimateStats(geoDataId, startDate, endDate);
    const extremeEvents = await ClimateData.getExtremeEvents(geoDataId, startDate, endDate);
    
    res.json({
      success: true,
      data: {
        statistics: {
          avgTemperature: stats.avgTemperature ? parseFloat(stats.avgTemperature) : null,
          maxTemperature: stats.maxTemperature ? parseFloat(stats.maxTemperature) : null,
          minTemperature: stats.minTemperature ? parseFloat(stats.minTemperature) : null,
          totalPrecipitation: stats.totalPrecipitation ? parseFloat(stats.totalPrecipitation) : null,
          avgPrecipitation: stats.avgPrecipitation ? parseFloat(stats.avgPrecipitation) : null,
          avgHumidity: stats.avgHumidity ? parseFloat(stats.avgHumidity) : null,
          avgWindSpeed: stats.avgWindSpeed ? parseFloat(stats.avgWindSpeed) : null,
          avgSolarRadiation: stats.avgSolarRadiation ? parseFloat(stats.avgSolarRadiation) : null,
          avgEvapotranspiration: stats.avgEvapotranspiration ? parseFloat(stats.avgEvapotranspiration) : null,
          totalDays: parseInt(stats.totalDays)
        },
        extremeEvents: {
          extremeTemperatures: extremeEvents.extremeTemperatures.length,
          extremePrecipitation: extremeEvents.extremePrecipitation.length,
          details: {
            extremeTemperatures: extremeEvents.extremeTemperatures.map(event => ({
              date: event.date,
              maxTemperature: event.maxTemperature ? parseFloat(event.maxTemperature) : null,
              minTemperature: event.minTemperature ? parseFloat(event.minTemperature) : null,
              type: event.maxTemperature >= 35 ? 'heat' : 'cold'
            })),
            extremePrecipitation: extremeEvents.extremePrecipitation.map(event => ({
              date: event.date,
              precipitation: parseFloat(event.precipitation)
            }))
          }
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas climáticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/climate/alerts - Obter alertas climáticos baseados em dados
router.get('/alerts', [
  query('geoDataId').optional().isUUID(),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('days').optional().isInt({ min: 1, max: 30 }),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, region, state, days = 7 } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const whereClause = {
      date: {
        [require('sequelize').Op.between]: [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      }
    };
    
    const includeWhere = { isActive: true };
    
    if (geoDataId) {
      whereClause.geoDataId = geoDataId;
    } else {
      if (region) includeWhere.region = region;
      if (state) includeWhere.state = state;
    }
    
    const climateData = await ClimateData.findAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere
      }],
      order: [['date', 'DESC']]
    });
    
    // Gerar alertas baseados nos dados
    const alerts = [];
    
    for (const data of climateData) {
      const alertsForLocation = [];
      
      // Alerta de temperatura alta
      if (data.maxTemperature && data.maxTemperature >= 35) {
        alertsForLocation.push({
          type: 'high_temperature',
          severity: 'warning',
          message: `Temperatura muito alta: ${data.maxTemperature}°C`,
          date: data.date,
          value: parseFloat(data.maxTemperature),
          threshold: 35
        });
      }
      
      // Alerta de temperatura baixa
      if (data.minTemperature && data.minTemperature <= 5) {
        alertsForLocation.push({
          type: 'low_temperature',
          severity: 'warning',
          message: `Temperatura muito baixa: ${data.minTemperature}°C`,
          date: data.date,
          value: parseFloat(data.minTemperature),
          threshold: 5
        });
      }
      
      // Alerta de chuva intensa
      if (data.precipitation && data.precipitation >= 50) {
        alertsForLocation.push({
          type: 'heavy_rain',
          severity: 'info',
          message: `Chuva intensa: ${data.precipitation}mm`,
          date: data.date,
          value: parseFloat(data.precipitation),
          threshold: 50
        });
      }
      
      // Alerta de estresse hídrico
      if (data.waterStressIndex && data.waterStressIndex >= 80) {
        alertsForLocation.push({
          type: 'water_stress',
          severity: 'danger',
          message: `Alto índice de estresse hídrico: ${data.waterStressIndex}%`,
          date: data.date,
          value: parseFloat(data.waterStressIndex),
          threshold: 80
        });
      }
      
      // Alerta de baixa umidade
      if (data.humidity && data.humidity <= 30) {
        alertsForLocation.push({
          type: 'low_humidity',
          severity: 'warning',
          message: `Umidade muito baixa: ${data.humidity}%`,
          date: data.date,
          value: parseFloat(data.humidity),
          threshold: 30
        });
      }
      
      if (alertsForLocation.length > 0) {
        alerts.push({
          location: {
            name: data.geoData.name,
            state: data.geoData.state,
            region: data.geoData.region
          },
          alerts: alertsForLocation
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          days: days
        },
        alerts: alerts,
        summary: {
          totalAlerts: alerts.reduce((sum, location) => sum + location.alerts.length, 0),
          locationsWithAlerts: alerts.length,
          alertTypes: {
            high_temperature: alerts.reduce((sum, location) => 
              sum + location.alerts.filter(a => a.type === 'high_temperature').length, 0),
            low_temperature: alerts.reduce((sum, location) => 
              sum + location.alerts.filter(a => a.type === 'low_temperature').length, 0),
            heavy_rain: alerts.reduce((sum, location) => 
              sum + location.alerts.filter(a => a.type === 'heavy_rain').length, 0),
            water_stress: alerts.reduce((sum, location) => 
              sum + location.alerts.filter(a => a.type === 'water_stress').length, 0),
            low_humidity: alerts.reduce((sum, location) => 
              sum + location.alerts.filter(a => a.type === 'low_humidity').length, 0)
          }
        }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar alertas climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/climate/:id - Obter dados climáticos específicos
router.get('/:id', [
  param('id').isUUID(),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const climateData = await ClimateData.findByPk(id, {
      include: [{
        model: GeoData,
        as: 'geoData'
      }]
    });
    
    if (!climateData) {
      return res.status(404).json({
        success: false,
        message: 'Dados climáticos não encontrados'
      });
    }
    
    res.json({
      success: true,
      data: climateData
    });
  } catch (error) {
    console.error('Erro ao buscar dados climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/climate - Criar novos dados climáticos
router.post('/', [
  body('geoDataId').isUUID(),
  body('date').isISO8601(),
  body('dataSource').isIn(['inmet', 'cptec', 'nasa', 'noaa', 'usuario', 'satelite', 'outros']),
  body('avgTemperature').optional().isDecimal(),
  body('maxTemperature').optional().isDecimal(),
  body('minTemperature').optional().isDecimal(),
  body('precipitation').optional().isDecimal(),
  body('humidity').optional().isDecimal(),
  body('windSpeed').optional().isDecimal(),
  body('windDirection').optional().isDecimal(),
  body('atmosphericPressure').optional().isDecimal(),
  body('solarRadiation').optional().isDecimal(),
  body('evapotranspiration').optional().isDecimal(),
  body('waterStressIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('climateSuitabilityIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('weatherStation').optional().isString(),
  body('stationCode').optional().isString(),
  body('dataQuality').optional().isDecimal({ min: 0, max: 100 }),
  validateRequest
], async (req, res) => {
  try {
    const climateData = req.body;
    
    // Extrair ano, mês e dia da data
    const date = new Date(climateData.date);
    climateData.year = date.getFullYear();
    climateData.month = date.getMonth() + 1;
    climateData.day = date.getDate();
    
    // Verificar se já existe dados para a mesma região e data
    const existing = await ClimateData.findOne({
      where: {
        geoDataId: climateData.geoDataId,
        date: climateData.date
      }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Já existem dados climáticos para esta região e data'
      });
    }
    
    const newClimateData = await ClimateData.create(climateData);
    
    res.status(201).json({
      success: true,
      data: newClimateData,
      message: 'Dados climáticos criados com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar dados climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /api/climate/:id - Atualizar dados climáticos
router.put('/:id', [
  param('id').isUUID(),
  body('avgTemperature').optional().isDecimal(),
  body('maxTemperature').optional().isDecimal(),
  body('minTemperature').optional().isDecimal(),
  body('precipitation').optional().isDecimal(),
  body('humidity').optional().isDecimal(),
  body('windSpeed').optional().isDecimal(),
  body('windDirection').optional().isDecimal(),
  body('atmosphericPressure').optional().isDecimal(),
  body('solarRadiation').optional().isDecimal(),
  body('evapotranspiration').optional().isDecimal(),
  body('waterStressIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('climateSuitabilityIndex').optional().isDecimal({ min: 0, max: 100 }),
  body('dataQuality').optional().isDecimal({ min: 0, max: 100 }),
  body('status').optional().isIn(['preliminar', 'confirmado', 'revisado', 'final']),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const climateData = await ClimateData.findByPk(id);
    
    if (!climateData) {
      return res.status(404).json({
        success: false,
        message: 'Dados climáticos não encontrados'
      });
    }
    
    await climateData.update(updateData);
    
    res.json({
      success: true,
      data: climateData,
      message: 'Dados climáticos atualizados com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar dados climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/climate/:id - Excluir dados climáticos
router.delete('/:id', [
  param('id').isUUID(),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const climateData = await ClimateData.findByPk(id);
    
    if (!climateData) {
      return res.status(404).json({
        success: false,
        message: 'Dados climáticos não encontrados'
      });
    }
    
    await climateData.destroy();
    
    res.json({
      success: true,
      message: 'Dados climáticos excluídos com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir dados climáticos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
