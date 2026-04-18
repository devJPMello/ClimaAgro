const express = require('express');
const { Op, literal } = require('sequelize');
const { models } = require('../config/database');
const { Weather } = models;
const { auth } = require('../middleware/auth');
const { validateWeatherData } = require('../middleware/validation');

const router = express.Router();

function mapWeatherToLegacyShape(row) {
  if (!row) return null;
  const lat = parseFloat(row.latitude);
  const lng = parseFloat(row.longitude);
  return {
    id: row.id,
    location: {
      name: row.locationName,
      state: row.locationState,
      coordinates: [lng, lat]
    },
    temperature: {
      current: parseFloat(row.temperatureCurrent),
      min: row.temperatureMin != null ? parseFloat(row.temperatureMin) : undefined,
      max: row.temperatureMax != null ? parseFloat(row.temperatureMax) : undefined,
      feelsLike: row.temperatureFeelsLike != null ? parseFloat(row.temperatureFeelsLike) : undefined
    },
    humidity: parseFloat(row.humidity),
    precipitation: {
      current: parseFloat(row.precipitationCurrent),
      last24h: parseFloat(row.precipitationLast24h),
      last7days: parseFloat(row.precipitationLast7days),
      last30days: parseFloat(row.precipitationLast30days)
    },
    wind: {
      speed: parseFloat(row.windSpeed),
      direction: row.windDirection,
      gust: row.windGust != null ? parseFloat(row.windGust) : undefined
    },
    pressure: row.pressure != null ? parseFloat(row.pressure) : undefined,
    condition: {
      main: row.conditionMain,
      description: row.conditionDescription,
      icon: row.conditionIcon
    },
    dataTimestamp: row.dataTimestamp,
    dataValidity: row.dataValidity,
    isDataValid: typeof row.isDataValid === 'function' ? row.isDataValid() : true
  };
}

router.get('/current', auth, async (req, res) => {
  try {
    const { state, city, lat, lng } = req.query;

    const where = {};
    if (state) where.locationState = String(state).toUpperCase();
    if (city) where.locationName = { [Op.iLike]: `%${city}%` };

    if (lat && lng) {
      const latN = parseFloat(lat);
      const lngN = parseFloat(lng);
      const rows = await Weather.findAll({
        where: literal(
          `ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${Number(lngN)}, ${Number(
            latN
          )}), 4326)::geography, 50000)`
        ),
        order: [['dataTimestamp', 'DESC']],
        limit: 50
      });
      const valid = (rows || []).filter((r) => r.isDataValid());
      return res.json({
        success: true,
        data: valid.map(mapWeatherToLegacyShape),
        count: valid.length
      });
    }

    const weatherData = await Weather.findAll({
      where,
      order: [['dataTimestamp', 'DESC']],
      limit: 50
    });
    const validData = weatherData.filter((d) => d.isDataValid());
    res.json({
      success: true,
      data: validData.map(mapWeatherToLegacyShape),
      count: validData.length
    });
  } catch (error) {
    console.error('Get current weather error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados climáticos'
    });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const { state, city, startDate, endDate, limit = 100, page = 1 } = req.query;

    const where = {};
    if (state) where.locationState = String(state).toUpperCase();
    if (city) where.locationName = { [Op.iLike]: `%${city}%` };
    if (startDate || endDate) {
      where.dataTimestamp = {};
      if (startDate) where.dataTimestamp[Op.gte] = new Date(startDate);
      if (endDate) where.dataTimestamp[Op.lte] = new Date(endDate);
    }

    const lim = parseInt(limit, 10) || 100;
    const pg = parseInt(page, 10) || 1;

    const { rows, count } = await Weather.findAndCountAll({
      where,
      order: [['dataTimestamp', 'DESC']],
      offset: (pg - 1) * lim,
      limit: lim
    });

    res.json({
      success: true,
      data: rows.map(mapWeatherToLegacyShape),
      pagination: {
        current: pg,
        total: Math.ceil(count / lim),
        count: rows.length,
        totalRecords: count
      }
    });
  } catch (error) {
    console.error('Get weather history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico climático'
    });
  }
});

router.get('/states', auth, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const states = await Weather.findAll({
      attributes: ['locationState'],
      where: { dataTimestamp: { [Op.gte]: since } },
      group: ['locationState'],
      raw: true
    });

    const statesWithData = await Promise.all(
      states.map(async (s) => {
        const st = s.locationState;
        const latestData = await Weather.findOne({
          where: { locationState: st },
          order: [['dataTimestamp', 'DESC']]
        });
        return {
          state: st,
          name: getStateName(st),
          latestUpdate: latestData?.dataTimestamp,
          temperature: latestData ? parseFloat(latestData.temperatureCurrent) : undefined,
          condition: latestData?.conditionMain
        };
      })
    );

    res.json({
      success: true,
      data: statesWithData
    });
  } catch (error) {
    console.error('Get states error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estados'
    });
  }
});

router.get('/cities/:state', auth, async (req, res) => {
  try {
    const { state } = req.params;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const cities = await Weather.findAll({
      attributes: ['locationName'],
      where: {
        locationState: state.toUpperCase(),
        dataTimestamp: { [Op.gte]: since }
      },
      group: ['locationName'],
      raw: true
    });

    const citiesWithData = await Promise.all(
      cities.map(async (c) => {
        const name = c.locationName;
        const latestData = await Weather.findOne({
          where: { locationState: state.toUpperCase(), locationName: name },
          order: [['dataTimestamp', 'DESC']]
        });
        return {
          name,
          coordinates: latestData
            ? [parseFloat(latestData.longitude), parseFloat(latestData.latitude)]
            : undefined,
          latestUpdate: latestData?.dataTimestamp,
          temperature: latestData ? parseFloat(latestData.temperatureCurrent) : undefined,
          condition: latestData?.conditionMain
        };
      })
    );

    res.json({
      success: true,
      data: citiesWithData
    });
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar cidades'
    });
  }
});

function mapRequestToWeather(body) {
  const loc = body.location || {};
  const lat = loc.coordinates?.[1] ?? body.latitude;
  const lng = loc.coordinates?.[0] ?? body.longitude;
  const tempCurrent =
    typeof body.temperature === 'number'
      ? body.temperature
      : body.temperature?.current ?? body.temperatureCurrent;
  const precCurrent =
    typeof body.precipitation === 'number'
      ? body.precipitation
      : body.precipitation?.current ?? body.precipitationCurrent ?? 0;

  return {
    locationName: loc.name || body.locationName,
    locationState: String(loc.state || body.locationState || '').toUpperCase(),
    latitude: lat,
    longitude: lng,
    temperatureCurrent: tempCurrent,
    temperatureMin: body.temperature?.min ?? body.temperatureMin,
    temperatureMax: body.temperature?.max ?? body.temperatureMax,
    temperatureFeelsLike: body.temperature?.feelsLike ?? body.temperatureFeelsLike,
    humidity: body.humidity,
    precipitationCurrent: precCurrent,
    precipitationLast24h: body.precipitation?.last24h ?? body.precipitationLast24h ?? 0,
    precipitationLast7days: body.precipitation?.last7days ?? body.precipitationLast7days ?? 0,
    precipitationLast30days: body.precipitation?.last30days ?? body.precipitationLast30days ?? 0,
    windSpeed: body.wind?.speed ?? body.windSpeed ?? 0,
    windDirection: body.wind?.direction ?? body.windDirection ?? 0,
    windGust: body.wind?.gust ?? body.windGust,
    pressure: body.pressure,
    visibility: body.visibility,
    uvIndex: body.uvIndex,
    conditionMain: body.condition?.main || body.conditionMain || 'unknown',
    conditionDescription: body.condition?.description || body.conditionDescription,
    conditionIcon: body.condition?.icon || body.conditionIcon,
    soilMoisture: body.soilMoisture,
    soilTemperature: body.soilTemperature,
    cropGrowthStage: body.cropGrowthStage,
    irrigationRecommendation: body.irrigationRecommendation,
    dataSource: body.dataSource || 'manual',
    dataTimestamp: body.dataTimestamp ? new Date(body.dataTimestamp) : new Date(),
    dataValidity: body.dataValidity ?? 24,
    municipality: body.municipality,
    region: body.region,
    microregion: body.microregion
  };
}

router.post('/', auth, validateWeatherData, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores.'
      });
    }

    const payload = mapRequestToWeather(req.body);
    const row = await Weather.create(payload);

    res.status(201).json({
      success: true,
      message: 'Dados climáticos adicionados com sucesso',
      data: mapWeatherToLegacyShape(row)
    });
  } catch (error) {
    console.error('Add weather data error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar dados climáticos'
    });
  }
});

router.get('/statistics', auth, async (req, res) => {
  try {
    const { state, city, days = 30 } = req.query;

    const where = {
      dataTimestamp: {
        [Op.gte]: new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000)
      }
    };
    if (state) where.locationState = String(state).toUpperCase();
    if (city) where.locationName = { [Op.iLike]: `%${city}%` };

    const weatherData = await Weather.findAll({
      where,
      order: [['dataTimestamp', 'ASC']]
    });

    if (weatherData.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'Nenhum dado encontrado para o período especificado'
        }
      });
    }

    const temperatures = weatherData.map((d) => parseFloat(d.temperatureCurrent));
    const humidities = weatherData.map((d) => parseFloat(d.humidity));
    const precipitations = weatherData.map((d) => parseFloat(d.precipitationCurrent));

    const statistics = {
      temperature: {
        average: Math.round(temperatures.reduce((a, b) => a + b, 0) / temperatures.length),
        min: Math.min(...temperatures),
        max: Math.max(...temperatures),
        trend: calculateTrend(temperatures)
      },
      humidity: {
        average: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
        min: Math.min(...humidities),
        max: Math.max(...humidities)
      },
      precipitation: {
        total: precipitations.reduce((a, b) => a + b, 0),
        average: Math.round(precipitations.reduce((a, b) => a + b, 0) / precipitations.length),
        max: Math.max(...precipitations)
      },
      period: {
        startDate: weatherData[0].dataTimestamp,
        endDate: weatherData[weatherData.length - 1].dataTimestamp,
        days: parseInt(days, 10),
        records: weatherData.length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Get weather statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas climáticas'
    });
  }
});

function getStateName(stateCode) {
  const states = {
    AC: 'Acre',
    AL: 'Alagoas',
    AP: 'Amapá',
    AM: 'Amazonas',
    BA: 'Bahia',
    CE: 'Ceará',
    DF: 'Distrito Federal',
    ES: 'Espírito Santo',
    GO: 'Goiás',
    MA: 'Maranhão',
    MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais',
    PA: 'Pará',
    PB: 'Paraíba',
    PR: 'Paraná',
    PE: 'Pernambuco',
    PI: 'Piauí',
    RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul',
    RO: 'Rondônia',
    RR: 'Roraima',
    SC: 'Santa Catarina',
    SP: 'São Paulo',
    SE: 'Sergipe',
    TO: 'Tocantins'
  };
  return states[stateCode] || stateCode;
}

function calculateTrend(values) {
  if (values.length < 2) return 'stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const difference = secondAvg - firstAvg;

  if (Math.abs(difference) < 1) return 'stable';
  return difference > 0 ? 'increasing' : 'decreasing';
}

module.exports = router;
