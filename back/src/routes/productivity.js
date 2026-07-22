const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../config/database');
const { Productivity, GeoData, ClimateData } = models;
const { validationResult } = require('express-validator');
const { body, query, param } = require('express-validator');
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');
const { fetchHistoricalDailyByCoords } = require('../services/openMeteoClient');

// Middleware de validação
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

function parseSeasonBaseYear(rawSeason) {
  const season = String(rawSeason || '').trim();
  const matchShort = /^(\d{2})\/\d{2}$/.exec(season);
  if (matchShort) return 2000 + parseInt(matchShort[1], 10);
  const matchFull = /^(\d{4})\/\d{2,4}$/.exec(season);
  if (matchFull) return parseInt(matchFull[1], 10);
  return null;
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function monthLabelFromYm(ym) {
  const [y, m] = String(ym || '').split('-').map((x) => parseInt(x, 10));
  if (!y || !m) return String(ym || '');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[m - 1]}/${String(y).slice(2)}`;
}

function isoDateUtcToday() {
  return new Date().toISOString().slice(0, 10);
}

function clampIsoDateToToday(isoDate) {
  const today = isoDateUtcToday();
  const d = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return today;
  return d > today ? today : d;
}

// GET /api/productivity/climate-vs-productivity - Série comparativa por safra
router.get('/climate-vs-productivity', [
  query('season').exists().isString().matches(/^(\d{2}|\d{4})\/(\d{2}|\d{4})$/),
  query('cropType').optional({ checkFalsy: true }).trim().isString().isLength({ min: 1, max: 80 }),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('municipality').optional().isString().isLength({ min: 1, max: 200 }),
  validateRequest
], async (req, res) => {
  try {
    const rawSeason = String(req.query.season || '').trim();
    const normalizedSeason = /^\d{2}\/\d{2}$/.test(rawSeason) ? `20${rawSeason}` : rawSeason;
    const state = String(req.query.state || 'TO').trim().toUpperCase().slice(0, 2);
    const municipality = String(req.query.municipality || '').trim();
    const cropType = req.query.cropType ? String(req.query.cropType).trim() : null;

    const baseYear = parseSeasonBaseYear(rawSeason);
    if (!baseYear) {
      return res.status(400).json({ success: false, message: 'Safra inválida.' });
    }
    const currentYear = new Date().getFullYear();
    if (baseYear < 2000 || baseYear > currentYear + 1) {
      return res.status(400).json({ success: false, message: 'Safra fora do intervalo válido (2000 até ano atual).' });
    }
    let startDate = `${baseYear}-01-01`;
    let endDate = `${baseYear}-12-31`;
    // Open-Meteo archive só aceita datas até "hoje".
    endDate = clampIsoDateToToday(endDate);
    if (startDate > endDate) startDate = endDate;

    const productivityWhere = {
      season: rawSeason === normalizedSeason ? rawSeason : { [Op.in]: [rawSeason, normalizedSeason] },
      state
    };
    if (cropType) productivityWhere.cropType = cropType;
    if (municipality) {
      productivityWhere.municipalityName = { [Op.iLike]: `%${municipality}%` };
    }

    const productivityRows = await Productivity.findAll({
      where: productivityWhere,
      include: [{
        model: GeoData,
        as: 'geoData',
        attributes: ['id', 'name'],
        required: false
      }],
      attributes: ['productivity', 'municipalityName', 'season', 'cropType', 'state']
    });

    const firstWithGeo = productivityRows.find((row) => row.geoData && row.geoData.id);
    const municipalityName = municipality || String(productivityRows[0]?.municipalityName || '');
    const centroidRows = firstWithGeo?.geoData?.id
      ? await sequelize.query(
          `
          SELECT
            ST_Y(ST_Centroid(geom))::float AS lat,
            ST_X(ST_Centroid(geom))::float AS lon
          FROM geo_data
          WHERE id = :geoDataId
          LIMIT 1
          `,
          {
            replacements: { geoDataId: firstWithGeo.geoData.id },
            type: QueryTypes.SELECT
          }
        )
      : await sequelize.query(
          `
          SELECT
            ST_Y(ST_Centroid(geom::geometry))::float AS lat,
            ST_X(ST_Centroid(geom::geometry))::float AS lon
          FROM geo_data
          WHERE category = 'state' AND state = :state
          LIMIT 1
          `,
          {
            replacements: { state },
            type: QueryTypes.SELECT
          }
        );
    const coords = centroidRows[0];
    if (!coords || !Number.isFinite(Number(coords.lat)) || !Number.isFinite(Number(coords.lon))) {
      return res.status(404).json({ success: false, message: 'Coordenadas não encontradas para a UF.' });
    }

    const climatePayload = await fetchHistoricalDailyByCoords({
      lat: Number(coords.lat),
      lon: Number(coords.lon),
      startDate,
      endDate
    });
    const daily = climatePayload?.daily || {};
    const precipArray = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : [];
    const tempArray = Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean : [];
    const humidityArray = Array.isArray(daily.relative_humidity_2m_mean) ? daily.relative_humidity_2m_mean : [];

    const avgProductivity = productivityRows.length
      ? mean(
          productivityRows
            .map((row) => Number(row.productivity))
            .filter((value) => Number.isFinite(value))
        )
      : null;

    const dayKeys = Array.isArray(daily.time) ? daily.time : [];
    const monthBuckets = new Map();
    for (let i = 0; i < dayKeys.length; i += 1) {
      const dayKey = String(dayKeys[i] || '');
      const ym = /^\d{4}-\d{2}/.test(dayKey) ? dayKey.slice(0, 7) : null;
      if (!ym) continue;
      if (!monthBuckets.has(ym)) monthBuckets.set(ym, { precs: [], temps: [], hums: [] });
      const bucket = monthBuckets.get(ym);
      const p = Number(precipArray[i]);
      if (Number.isFinite(p)) bucket.precs.push(p);
      const t = Number(tempArray[i]);
      if (Number.isFinite(t)) bucket.temps.push(t);
      const h = Number(humidityArray[i]);
      if (Number.isFinite(h)) bucket.hums.push(h);
    }

    const monthlyData = [...monthBuckets.keys()].sort().map((ym) => {
      const bucket = monthBuckets.get(ym);
      const monthPrecipitation = bucket.precs.reduce((acc, value) => acc + value, 0);
      const monthTemperature = mean(bucket.temps);
      const monthHumidity = mean(bucket.hums);
      return {
        season: rawSeason,
        month: ym,
        mes: monthLabelFromYm(ym),
        climate: Math.round(monthPrecipitation * 10) / 10,
        productivity: avgProductivity != null ? Math.round(avgProductivity * 100) / 100 : null,
        avgTemperature: monthTemperature != null ? Math.round(monthTemperature * 10) / 10 : null,
        avgHumidity: monthHumidity != null ? Math.round(monthHumidity * 10) / 10 : null
      };
    });

    res.json({
      success: true,
      data: monthlyData,
      meta: {
        season: rawSeason,
        baseYear,
        startDate,
        endDate,
        municipality: municipalityName || undefined,
        state
      }
    });
  } catch (error) {
    console.error('Erro ao montar clima vs produtividade por safra:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity - Listar dados de produtividade com filtros
router.get('/', [
  query('year').optional().isInt({ min: 2000, max: 2030 }),
  query('mesAno').optional().matches(/^\d{4}-\d{2}$/),
  query('season').optional().matches(/^\d{4}\/\d{2}$/),
  query('period').optional().matches(/^\d{4}-\d{2}$/),
  query('cropType').optional({ checkFalsy: true }).trim().isString().isLength({ min: 1, max: 80 }),
  query('productLabel').optional().isString().isLength({ min: 1, max: 300 }),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  query('municipality').optional().isString().isLength({ min: 1, max: 200 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], async (req, res) => {
  try {
    const { year, mesAno, season, period, cropType, productLabel, region, state, municipality, limit = 50, offset = 0 } = req.query;
    
    const whereClause = {};
    const includeWhere = { isActive: true };
    
    if (mesAno) whereClause.periodRef = String(mesAno);
    else if (period) whereClause.periodRef = String(period);
    else if (season) whereClause.season = String(season);
    else if (year) whereClause.year = year;
    if (cropType) whereClause.cropType = cropType;
    if (productLabel && String(productLabel).trim()) {
      whereClause.productLabel = String(productLabel).trim();
    }
    if (state && String(state).trim()) {
      whereClause.state = String(state).trim().toUpperCase().slice(0, 2);
    }
    if (municipality && String(municipality).trim()) {
      const m = String(municipality).trim();
      whereClause.municipalityName = { [Op.iLike]: `%${m}%` };
    }
    if (region) includeWhere.region = region;

    const lim = Math.min(parseInt(String(limit), 10) || 50, 500);
    const off = Math.max(parseInt(String(offset), 10) || 0, 0);

    const order =
      municipality && String(municipality).trim()
        ? [
            ['year', 'ASC'],
            ['productLabel', 'ASC'],
            ['cropType', 'ASC'],
          ]
        : [['productivity', 'DESC']];

    const productivity = await Productivity.findAndCountAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere,
        required: false
      }],
      distinct: true,
      col: 'id',
      order,
      limit: lim,
      offset: off
    });
    
    res.json({
      success: true,
      data: productivity.rows,
      pagination: {
        total: productivity.count,
        limit: lim,
        offset: off,
        pages: lim ? Math.ceil(productivity.count / lim) : 0
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

// GET /api/productivity/crop-types — culturas distintas presentes na base (opcionalmente por UF)
router.get('/crop-types', [
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const raw = req.query.state != null ? String(req.query.state).trim().toUpperCase().slice(0, 2) : '';
    const uf = /^[A-Z]{2}$/.test(raw) ? raw : null;
    const rows = await sequelize.query(
      `
      SELECT DISTINCT p.crop_type AS "cropType"
      FROM productivity p
      WHERE (:uf::text IS NULL OR p.state = :uf)
      ORDER BY p.crop_type ASC
      `,
      {
        replacements: { uf },
        type: QueryTypes.SELECT
      }
    );
    const data = rows.map((r) => r.cropType).filter((x) => x != null && String(x).trim() !== '');
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao listar crop-types:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/product-labels — rótulos distintos (produto SIDRA / nome exibido), opcionalmente por UF
router.get('/product-labels', [
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const raw = req.query.state != null ? String(req.query.state).trim().toUpperCase().slice(0, 2) : '';
    const uf = /^[A-Z]{2}$/.test(raw) ? raw : null;
    // A tabela 6588 do IBGE tem uma linha por estado×cultura mesmo quando a cultura não é
    // cultivada ali (produção/área zeradas — ver observations). Ao filtrar por UF, exclui essas
    // linhas "vazias" para não listar culturas sem dado real naquele estado.
    const rows = await sequelize.query(
      `
      SELECT DISTINCT p.product_label AS "productLabel"
      FROM productivity p
      WHERE (:uf::text IS NULL OR p.state = :uf)
        AND (:uf::text IS NULL OR p.total_production > 0 OR p.planted_area > 0 OR p.productivity > 0)
      ORDER BY p.product_label ASC
      `,
      {
        replacements: { uf },
        type: QueryTypes.SELECT
      }
    );
    const data = rows.map((r) => r.productLabel).filter((x) => x != null && String(x).trim() !== '');
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao listar product-labels:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/productivity/month-years — períodos mensais distintos (YYYY-MM), opcionalmente por UF
router.get('/month-years', [
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const raw = req.query.state != null ? String(req.query.state).trim().toUpperCase().slice(0, 2) : '';
    const uf = /^[A-Z]{2}$/.test(raw) ? raw : null;
    const rows = await sequelize.query(
      `
      SELECT DISTINCT p.period_ref AS "monthYear"
      FROM productivity p
      WHERE p.period_ref IS NOT NULL
        AND p.period_ref <> ''
        AND (:uf::text IS NULL OR p.state = :uf)
      ORDER BY p.period_ref DESC
      `,
      {
        replacements: { uf },
        type: QueryTypes.SELECT
      }
    );
    const data = rows
      .map((r) => String(r.monthYear || '').trim())
      .filter((x) => /^\d{4}-\d{2}$/.test(x));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao listar month-years:', error);
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
  query('cropType').optional({ checkFalsy: true }).trim().isString().isLength({ min: 1, max: 80 }),
  query('productLabel').optional().isString().isLength({ min: 1, max: 300 }),
  query('region').optional().isString(),
  query('state').optional().isString().isLength({ min: 2, max: 2 }),
  validateRequest
], async (req, res) => {
  try {
    const { year, cropType, productLabel, region, state } = req.query;
    
    const whereClause = { year };
    const includeWhere = { isActive: true };
    
    if (cropType) whereClause.cropType = cropType;
    if (productLabel && String(productLabel).trim()) {
      whereClause.productLabel = String(productLabel).trim();
    }
    if (state && String(state).trim()) {
      whereClause.state = String(state).trim().toUpperCase().slice(0, 2);
    }
    if (region) includeWhere.region = region;
    
    const productivity = await Productivity.findAll({
      where: whereClause,
      include: [{
        model: GeoData,
        as: 'geoData',
        where: includeWhere,
        required: false
      }]
    });
    
    // Converter para GeoJSON (só linhas com geometria em geo_data)
    const features = productivity.filter((r) => r.geoData && r.geoData.geom).map(record => {
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
          municipalityName: record.municipalityName,
          state: geoData.state || record.state,
          region: geoData.region,
          year: record.year,
          season: record.season,
          cropType: record.cropType,
          productLabel: record.productLabel,
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
  query('cropType').trim().isString().isLength({ min: 1, max: 80 }),
  query('productLabel').optional().isString().isLength({ min: 1, max: 300 }),
  query('startYear').isInt({ min: 2000, max: 2030 }),
  query('endYear').isInt({ min: 2000, max: 2030 }),
  validateRequest
], async (req, res) => {
  try {
    const { geoDataId, cropType, productLabel, startYear, endYear } = req.query;
    const pl = productLabel && String(productLabel).trim() ? String(productLabel).trim() : null;
    
    const timeSeries = await Productivity.getTimeSeries(geoDataId, cropType, startYear, endYear, pl);
    
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
  query('cropType').optional({ checkFalsy: true }).trim().isString().isLength({ min: 1, max: 80 }),
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
  body('geoDataId').optional().isUUID(),
  body('year').isInt({ min: 2000, max: 2030 }),
  body('season').isString().isLength({ min: 1, max: 10 }),
  body('cropType').trim().isString().isLength({ min: 1, max: 80 }),
  body('state').optional().isString().isLength({ min: 2, max: 2 }),
  body('municipalityName').optional().isString().isLength({ min: 1, max: 200 }),
  body('productLabel').optional().isString().isLength({ min: 1, max: 300 }),
  body('productivity').isDecimal(),
  body('plantedArea').isDecimal(),
  body('totalProduction').isDecimal(),
  body('dataSource').isIn(['ibge', 'conab', 'embrapa', 'usuario', 'satelite', 'outros']),
  validateRequest
], async (req, res) => {
  try {
    const productivityData = { ...req.body };
    const pl =
      productivityData.productLabel && String(productivityData.productLabel).trim()
        ? String(productivityData.productLabel).trim()
        : String(productivityData.cropType || '');
    productivityData.productLabel = pl;

    const st = String(productivityData.state || 'TO')
      .trim()
      .toUpperCase()
      .slice(0, 2);
    productivityData.state = st;

    let munName = String(productivityData.municipalityName || '').trim();
    if (!munName && productivityData.geoDataId) {
      const g = await GeoData.findByPk(productivityData.geoDataId, { attributes: ['name'] });
      munName = g?.name ? String(g.name).trim() : '';
    }
    if (!munName) {
      return res.status(400).json({
        success: false,
        message: 'Informe municipalityName ou geoDataId com nome em geo_data'
      });
    }
    productivityData.municipalityName = munName;
    productivityData.municipalityKey = normalizeMunicipalityKey(munName);
    if (productivityData.municipalityIbgeCode != null) {
      const c = String(productivityData.municipalityIbgeCode).replace(/\D/g, '').slice(0, 7);
      productivityData.municipalityIbgeCode = c.length === 7 ? c : null;
    }

    const existing = await Productivity.findOne({
      where: {
        state: st,
        municipalityKey: productivityData.municipalityKey,
        year: productivityData.year,
        productLabel: pl
      }
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Já existem dados de produtividade para este município/UF, ano e produto'
      });
    }
    
    const productivity = await Productivity.create(productivityData);
    
    await Productivity.calculateHistoricalVariation(productivity.id);
    
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
      await Productivity.calculateHistoricalVariation(productivity.id);
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
