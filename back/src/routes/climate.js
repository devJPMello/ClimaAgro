const express = require('express');
const router = express.Router();
const { sequelize, models } = require('../config/database');
const { ClimateData, GeoData, OfficialAlert } = models;
const { buildDashboardSummary } = require('../services/dashboardSummaryService');
const { runClimateSync } = require('../services/climateSyncService');
const alertSvc = require('../services/climateAlertsUiService');

function requireClimateSyncToken(req, res, next) {
  const secret = process.env.CLIMATE_SYNC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ message: 'CLIMATE_SYNC_SECRET não configurada no servidor.' });
    }
    return next();
  }
  const token = req.header('x-climaagro-sync-token');
  if (token !== secret) {
    return res.status(401).json({ message: 'Token de sincronização inválido ou ausente.' });
  }
  return next();
}
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
  query('place').optional().isString().trim().isLength({ min: 2, max: 200 }),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], async (req, res) => {
  try {
    const { startDate, endDate, region, state, place, limit = 100, offset = 0 } = req.query;
    
    const whereClause = {};
    const includeWhere = { isActive: true };
    
    if (startDate && endDate) {
      whereClause.date = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    }
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
    if (place) {
      if (!state) {
        return res.status(400).json({
          success: false,
          message: 'O parâmetro place exige state (sigla da UF, ex.: TO).'
        });
      }
      includeWhere.name = String(place).trim();
    }
    
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

// GET /api/climate/dashboard-summary — contrato alinhado ao new_front (DashboardSummaryDto)
// Query opcional: ?state=TO — KPIs e tabela apenas para essa UF (se existir em geo_data).
router.get('/dashboard-summary', [
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const dto = await buildDashboardSummary({ models, state: req.query.state });
    res.json(dto);
  } catch (error) {
    console.error('Erro ao montar dashboard-summary:', error);
    res.status(500).json({
      message: 'Erro ao montar resumo do dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/climate/sync — ingere CPTEC/INMET no PostgreSQL (ver DATA_SOURCES.md e .env)
router.post('/sync', requireClimateSyncToken, async (req, res) => {
  try {
    const out = await runClimateSync({ sequelize, models });
    if (!out.ok) {
      return res.status(500).json({ message: 'Falha na sincronização', error: out.error });
    }
    res.json({ ok: true, ...out });
  } catch (error) {
    console.error('Erro na sincronização climática:', error);
    res.status(500).json({
      message: 'Erro na sincronização climática',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/climate/alerts — padrão: ClimateAlertListDto; `?legacy=1` mantém JSON antigo
router.get('/alerts', [
  query('geoDataId').optional().isUUID(),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('city').optional().isString().trim().isLength({ min: 2, max: 100 }),
  query('days').optional().isInt({ min: 1, max: 30 }),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, region, state, city, days = 7 } = req.query;
    const legacy =
      req.query.legacy === '1' ||
      req.query.legacy === 'true' ||
      (req.get('Accept') || '').includes('application/vnd.climaagro.climate-alerts-legacy+json');

    const climateData = await alertSvc.loadClimateForAlerts({
      ClimateData,
      GeoData,
      geoDataId,
      region,
      state,
      days
    });

    if (legacy) {
      const payload = alertSvc.buildLegacyAlertsPayload(climateData, days);
      return res.json({
        success: true,
        data: payload
      });
    }

    const officialRows = await alertSvc.loadOfficialAlertsForUi({ OfficialAlert, days });
    const liveNormalized = await alertSvc.fetchLiveOfficialProductsForRead(days);
    const dbExternalIds = new Set(officialRows.map((r) => String(r.externalId || '')));
    const liveOnlyNormalized = liveNormalized.filter((n) => !dbExternalIds.has(n.externalId));

    const officialFromDb = await alertSvc.buildOfficialAlertUiItems(officialRows, state, city, GeoData);
    const officialFromLive = await alertSvc.buildOfficialAlertUiItems(
      alertSvc.normalizedListToOfficialRowLikes(liveOnlyNormalized),
      state,
      city,
      GeoData
    );
    const includeCptecQualitative = process.env.ENABLE_CPTEC_QUALITATIVE_ALERTS === 'true';
    const cptecOutlook = includeCptecQualitative
      ? alertSvc.deriveCptecOutlookAlertsFromClimateRows(climateData)
      : [];
    const metarWind = alertSvc.deriveMetarWindAlertsFromClimateRows(climateData);
    const derivedClimate = alertSvc.deriveAlertsFromClimateRows(climateData);

    const items = [
      ...officialFromDb,
      ...officialFromLive,
      ...cptecOutlook,
      ...metarWind,
      ...derivedClimate
    ];
    res.json({
      items,
      updatedAt: new Date().toISOString(),
      resumoCamadas: {
        oficialExplicito: officialFromDb.length + officialFromLive.length,
        cptecProduto: cptecOutlook.length + metarWind.length,
        derivadoClimateData: derivedClimate.length
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
