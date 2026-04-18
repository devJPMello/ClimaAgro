const { createUpstreamAxios, axiosWithRetries } = require('./httpUpstream');

/**
 * INMET — catálogo OGC API Features (WIS2 Brazil).
 * Base e listagem de coleções: https://wis2bra.inmet.gov.br/oapi/collections?f=json
 * (confirmar coleções e itens no catálogo oficial; acesso pode variar por rede/regras do servidor.)
 */
function getBaseUrl() {
  return (process.env.INMET_BASE_URL || 'https://wis2bra.inmet.gov.br/oapi').replace(/\/$/, '');
}

async function fetchJson(pathOrUrl) {
  const isAbs = /^https?:\/\//i.test(pathOrUrl);
  const client = createUpstreamAxios({ baseURL: isAbs ? undefined : getBaseUrl() });
  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url: pathOrUrl,
      headers: { Accept: 'application/json' },
      responseType: 'json'
    },
    { retries: 2 }
  );
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`INMET HTTP ${res.status}`);
    err.response = res;
    throw err;
  }
  return res.data;
}

async function listCollections() {
  return fetchJson('/collections?f=json');
}

/**
 * Busca GeoJSON em URL absoluta (ex.: item completo configurado pelo time a partir do catálogo INMET).
 */
async function fetchGeoJsonFromUrl(absoluteUrl) {
  const client = createUpstreamAxios({ baseURL: undefined });
  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url: absoluteUrl,
      headers: { Accept: 'application/geo+json, application/json' },
      responseType: 'json'
    },
    { retries: 2 }
  );
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`INMET sync URL HTTP ${res.status}`);
    err.response = res;
    throw err;
  }
  return res.data;
}

function pickNum(props, keys) {
  if (!props || typeof props !== 'object') return null;
  for (const k of keys) {
    const variants = [k, String(k).toUpperCase(), String(k).toLowerCase()];
    for (const key of variants) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      const v = props[key];
      if (v === null || v === undefined || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (n === 9999 || n === -9999) continue;
      return n;
    }
  }
  return null;
}

/**
 * Normaliza um Feature OGC genérico para campos compatíveis com ClimateData (o que existir).
 */
function normalizeFeature(feature) {
  const p = (feature && feature.properties) || {};
  const geom = feature && feature.geometry;
  let lon = null;
  let lat = null;
  if (geom && geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    lon = Number(geom.coordinates[0]);
    lat = Number(geom.coordinates[1]);
  }
  const tmax = pickNum(p, ['TEM_MAX', 'tem_max', 'max_temperature', 'temperature_max', 'TX']);
  const tmin = pickNum(p, ['TEM_MIN', 'tem_min', 'min_temperature', 'temperature_min', 'TN']);
  const tmed = pickNum(p, ['TEM_MED', 'tem_med', 'avg_temperature', 'temperature_avg', 'TEMP_MED']);
  const prec = pickNum(p, ['CHUVA', 'precipitation', 'PREC', 'RR', 'prec']);
  const hum = pickNum(p, ['UMD', 'humidity', 'UR']);
  const wind = pickNum(p, ['VEN_VEL', 'wind_speed', 'WS']);
  const pres = pickNum(p, ['PRES', 'pressure', 'PRESS']);
  const stationCode = String(p.CD_ESTACAO || p.station_id || p.id || p.codigo || '').slice(0, 20) || null;
  const stationName = String(p.DC_NOME || p.name || p.estacao || '').slice(0, 100) || null;
  let date = p.DATA || p.data || p.datetime || p.date || null;
  if (date && typeof date === 'string' && date.includes('T')) {
    date = date.slice(0, 10);
  }
  return {
    date,
    lat,
    lon,
    maxTemperature: tmax,
    minTemperature: tmin,
    avgTemperature: tmed != null ? tmed : tmax != null && tmin != null ? (tmax + tmin) / 2 : null,
    precipitation: prec,
    humidity: hum,
    windSpeed: wind,
    atmosphericPressure: pres,
    stationCode,
    stationName
  };
}

module.exports = {
  getBaseUrl,
  fetchJson,
  listCollections,
  fetchGeoJsonFromUrl,
  normalizeFeature
};
