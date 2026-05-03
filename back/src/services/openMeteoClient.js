const { createUpstreamAxios, axiosWithRetries } = require('./httpUpstream');

function getBaseUrl() {
  return (process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com/v1').replace(/\/$/, '');
}

function getArchiveBaseUrl() {
  return (process.env.OPEN_METEO_ARCHIVE_BASE_URL || 'https://archive-api.open-meteo.com/v1').replace(/\/$/, '');
}

async function fetchForecastDailyByCoords({ lat, lon, daysBack = 7, daysForward = 7 }) {
  const client = createUpstreamAxios({ baseURL: getBaseUrl(), timeoutMs: Number(process.env.OPEN_METEO_TIMEOUT_MS || 20000) });
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: process.env.OPEN_METEO_TIMEZONE || 'America/Sao_Paulo',
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'relative_humidity_2m_mean',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
      'surface_pressure_mean'
    ].join(','),
    past_days: String(daysBack),
    forecast_days: String(daysForward)
  });

  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url: `/forecast?${params.toString()}`,
      headers: { Accept: 'application/json' },
      responseType: 'json'
    },
    { retries: 2 }
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }

  return res.data;
}

async function fetchHistoricalDailyByCoords({ lat, lon, startDate, endDate }) {
  const client = createUpstreamAxios({
    baseURL: getArchiveBaseUrl(),
    timeoutMs: Number(process.env.OPEN_METEO_TIMEOUT_MS || 20000)
  });
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: process.env.OPEN_METEO_TIMEZONE || 'America/Sao_Paulo',
    start_date: String(startDate),
    end_date: String(endDate),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'relative_humidity_2m_mean',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
      'surface_pressure_mean'
    ].join(',')
  });

  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url: `/archive?${params.toString()}`,
      headers: { Accept: 'application/json' },
      responseType: 'json'
    },
    { retries: 2 }
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Open-Meteo Historical HTTP ${res.status}`);
  }

  return res.data;
}

function dailyToRows(payload) {
  const d = payload && payload.daily ? payload.daily : null;
  if (!d || !Array.isArray(d.time)) return [];

  const rows = [];
  for (let i = 0; i < d.time.length; i += 1) {
    const date = d.time[i];
    if (!date) continue;
    rows.push({
      date,
      maxTemperature: d.temperature_2m_max?.[i] ?? null,
      minTemperature: d.temperature_2m_min?.[i] ?? null,
      avgTemperature: d.temperature_2m_mean?.[i] ?? null,
      precipitation: d.precipitation_sum?.[i] ?? null,
      humidity: d.relative_humidity_2m_mean?.[i] ?? null,
      windSpeed: d.wind_speed_10m_max?.[i] ?? null,
      windDirection: d.wind_direction_10m_dominant?.[i] ?? null,
      atmosphericPressure: d.surface_pressure_mean?.[i] ?? null
    });
  }
  return rows;
}

module.exports = { fetchForecastDailyByCoords, fetchHistoricalDailyByCoords, dailyToRows };
