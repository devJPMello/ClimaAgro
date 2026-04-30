const { Op } = require('sequelize');
const crypto = require('crypto');
const inmetAlerts = require('./inmetAlertsClient');
const { reconcileAlertStates } = require('./inmetAdapterService');
const { isPrecipitationLikelyFromTempoCode } = require('../data/cptecRainTempoCodes');

function fmtDateBR(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('T')[0].split('-');
  if (!y || !m || !d) return String(isoDate);
  return `${d}/${m}/${y}`;
}

function mapSeverityBackendToDto(sev) {
  const allowed = ['low', 'medium', 'high', 'critical'];
  if (allowed.includes(sev)) return sev;
  const m = {
    danger: 'critical',
    warning: 'high',
    info: 'medium'
  };
  return m[sev] || 'medium';
}

function buildUiItem({
  id,
  tipo,
  local,
  valorAtual,
  limiar,
  recomendacao,
  impactoEstimado,
  severidade,
  dataIso,
  fonte = 'derivado',
  severityRaw
}) {
  let sevDto;
  if (fonte === 'inmet') {
    sevDto = inmetAlerts.normalizeSeverity(severityRaw || severidade);
  } else if (fonte === 'cptec') {
    sevDto = severidade;
  } else {
    sevDto = mapSeverityBackendToDto(severidade);
  }
  return {
    id: id || crypto.randomUUID(),
    tipo,
    local,
    valorAtual,
    limiar,
    recomendacao,
    impactoEstimado,
    severidade: sevDto,
    data: fmtDateBR(dataIso),
    fonte
  };
}

/**
 * Deriva alertas a partir de ClimateData + GeoData (mesma lógica conceitual da rota legada).
 */
function deriveAlertsFromClimateRows(climateData) {
  const items = [];
  for (const data of climateData) {
    const geo = data.geoData;
    const local = geo ? `${geo.name}${geo.state ? ` - ${geo.state}` : ''}` : '—';

    if (data.maxTemperature != null && Number(data.maxTemperature) >= 35) {
      items.push(
        buildUiItem({
          tipo: 'Temperatura elevada',
          local,
          valorAtual: `${Number(data.maxTemperature).toFixed(1)}°C`,
          limiar: '35°C',
          recomendacao: 'Monitorar irrigação e estresse térmico nas próximas 48h.',
          impactoEstimado: 'Risco de redução de rendimento em culturas sensíveis ao calor.',
          severidade: 'warning',
          dataIso: data.date,
          fonte: 'derivado'
        })
      );
    }
    if (data.minTemperature != null && Number(data.minTemperature) <= 5) {
      items.push(
        buildUiItem({
          tipo: 'Temperatura baixa / geada',
          local,
          valorAtual: `${Number(data.minTemperature).toFixed(1)}°C`,
          limiar: '5°C',
          recomendacao: 'Proteger culturas sensíveis; revisar calendário de campo.',
          impactoEstimado: 'Dano mecânico ou parada de desenvolvimento em áreas expostas.',
          severidade: 'danger',
          dataIso: data.date,
          fonte: 'derivado'
        })
      );
    }
    if (data.precipitation != null && Number(data.precipitation) >= 50) {
      items.push(
        buildUiItem({
          tipo: 'Chuva intensa',
          local,
          valorAtual: `${Number(data.precipitation).toFixed(1)} mm`,
          limiar: '50 mm (dia)',
          recomendacao: 'Evitar tráfego de máquinas em solo encharcado; drenagem e segurança.',
          impactoEstimado: 'Lixiviação e risco operacional em campo.',
          severidade: 'info',
          dataIso: data.date,
          fonte: 'derivado'
        })
      );
    }
    if (data.waterStressIndex != null && Number(data.waterStressIndex) >= 80) {
      items.push(
        buildUiItem({
          tipo: 'Estresse hídrico',
          local,
          valorAtual: `${Number(data.waterStressIndex).toFixed(0)}%`,
          limiar: '80%',
          recomendacao: 'Avaliar irrigação e janelas de plantio; priorizar cultura/resíduo.',
          impactoEstimado: 'Queda potencial de produtividade se o déficit persistir.',
          severidade: 'danger',
          dataIso: data.date,
          fonte: 'derivado'
        })
      );
    }
    if (data.humidity != null && Number(data.humidity) <= 30) {
      items.push(
        buildUiItem({
          tipo: 'Umidade baixa',
          local,
          valorAtual: `${Number(data.humidity).toFixed(0)}%`,
          limiar: '30%',
          recomendacao: 'Aumentar monitoramento de irrigação e umidade do solo.',
          impactoEstimado: 'Estresse hídrico foliar em estágios críticos.',
          severidade: 'warning',
          dataIso: data.date,
          fonte: 'derivado'
        })
      );
    }
  }
  return items;
}

async function loadClimateForAlerts({ ClimateData, GeoData, geoDataId, region, state, days }) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 7));

  const whereClause = {
    date: {
      [Op.between]: [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    }
  };
  const includeWhere = { isActive: true };
  if (geoDataId) whereClause.geoDataId = geoDataId;
  else {
    if (region) includeWhere.region = region;
    if (state) includeWhere.state = state;
  }

  return ClimateData.findAll({
    where: whereClause,
    include: [{ model: GeoData, as: 'geoData', where: includeWhere }],
    order: [['date', 'DESC']]
  });
}

function buildLegacyAlertsPayload(climateData, days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 7));

  const alerts = [];
  for (const data of climateData) {
    const alertsForLocation = [];
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

  return {
    period: {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      days: Number(days || 7)
    },
    alerts,
    summary: {
      totalAlerts: alerts.reduce((sum, location) => sum + location.alerts.length, 0),
      locationsWithAlerts: alerts.length,
      alertTypes: {
        high_temperature: alerts.reduce(
          (sum, location) => sum + location.alerts.filter((a) => a.type === 'high_temperature').length,
          0
        ),
        low_temperature: alerts.reduce(
          (sum, location) => sum + location.alerts.filter((a) => a.type === 'low_temperature').length,
          0
        ),
        heavy_rain: alerts.reduce(
          (sum, location) => sum + location.alerts.filter((a) => a.type === 'heavy_rain').length,
          0
        ),
        water_stress: alerts.reduce(
          (sum, location) => sum + location.alerts.filter((a) => a.type === 'water_stress').length,
          0
        ),
        low_humidity: alerts.reduce(
          (sum, location) => sum + location.alerts.filter((a) => a.type === 'low_humidity').length,
          0
        )
      }
    }
  };
}

function deriveCptecOutlookAlertsFromClimateRows(climateData) {
  const items = [];
  for (const data of climateData) {
    const geo = data.geoData;
    const local = geo ? `${geo.name}${geo.state ? ` - ${geo.state}` : ''}` : '—';
    const tempo = data.metadata && data.metadata.cptec && data.metadata.cptec.tempo;
    if (tempo && isPrecipitationLikelyFromTempoCode(tempo)) {
      items.push(
        buildUiItem({
          tipo: 'Precipitação prevista (CPTEC — qualitativa)',
          local,
          valorAtual: `Sigla: ${String(tempo).toLowerCase()} (tabela oficial de condições do tempo)`,
          limiar: '—',
          recomendacao:
            'O produto municipal de previsão do CPTEC não informa mm/dia; use esta indicação junto com medições (ex.: INMET) quando disponíveis.',
          impactoEstimado: 'Ajustar logística de campo e drenagem conforme risco de chuva prevista.',
          severidade: 'medium',
          dataIso: data.date,
          fonte: 'cptec'
        })
      );
    }
  }
  return items;
}

function deriveMetarWindAlertsFromClimateRows(climateData) {
  const items = [];
  for (const data of climateData) {
    if (data.windSpeed == null || Number(data.windSpeed) < 50) continue;
    const geo = data.geoData;
    const local = geo ? `${geo.name}${geo.state ? ` - ${geo.state}` : ''}` : '—';
    const fromMetar = !!(data.metadata && data.metadata.cptecMetar);
    items.push(
      buildUiItem({
        tipo: fromMetar ? 'Vento forte (METAR / CPTEC)' : 'Vento forte',
        local,
        valorAtual: `${Number(data.windSpeed).toFixed(0)} km/h`,
        limiar: '50 km/h',
        recomendacao: 'Evitar pulverização aérea; reforçar estruturas e toldos.',
        impactoEstimado: 'Risco operacional e dano mecânico em culturas altas.',
        severidade: Number(data.windSpeed) >= 70 ? 'high' : 'medium',
        dataIso: data.date,
        fonte: fromMetar ? 'cptec' : 'derivado'
      })
    );
  }
  return items;
}

function normalizeCityKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Substituições só para **exibição** no app (título/resumo). O `externalId` e o link no `payload` continuam
 * apontando para o aviso original do INMET. Desligar: `INMET_ALERT_FRIENDLY_LABELS=false`.
 */
const INMET_TO_REGION_LABELS = [
  { pattern: /\boriental do tocantins\b/gi, replacement: 'Tocantins — mesorregião Oriental' },
  { pattern: /\bocidental do tocantins\b/gi, replacement: 'Tocantins — mesorregião Ocidental' },
  { pattern: /\bnoroeste do tocantins\b/gi, replacement: 'Tocantins — mesorregião Noroeste' },
  { pattern: /\bnordeste do tocantins\b/gi, replacement: 'Tocantins — mesorregião Nordeste' },
  { pattern: /\bcentro(?:[-\s]oeste)? do tocantins\b/gi, replacement: 'Tocantins — mesorregião Centro-Oeste' },
  { pattern: /\bsul do tocantins\b/gi, replacement: 'Tocantins — mesorregião Sul' }
];

function friendlyInmetDisplayCopy(text) {
  const on = !['false', '0', 'no'].includes(String(process.env.INMET_ALERT_FRIENDLY_LABELS || 'true').toLowerCase());
  if (!on || text == null || typeof text !== 'string') return text || '';
  let t = text;
  for (const { pattern, replacement } of INMET_TO_REGION_LABELS) {
    t = t.replace(pattern, replacement);
  }
  return t;
}

function extractCitiesFromRow(row) {
  if (Array.isArray(row?.payload?.cities)) {
    return [...new Set(row.payload.cities.map((x) => String(x).trim()).filter(Boolean))];
  }
  return [];
}

function capPolygonToWkt(polygonText) {
  if (!polygonText || typeof polygonText !== 'string') return null;
  const tokens = polygonText
    .trim()
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const points = [];
  for (const t of tokens) {
    const pair = t.split(',');
    if (pair.length !== 2) continue;
    const lat = Number(pair[0]);
    const lon = Number(pair[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push([lon, lat]);
  }
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    points.push(first);
  }
  const ring = points.map((p) => `${p[0]} ${p[1]}`).join(', ');
  return `POLYGON((${ring}))`;
}

function fullTextForOfficialAlertRow(r) {
  const cap = r?.payload?.cap || {};
  return [
    r?.title,
    r?.description,
    cap.instruction,
    cap.areaDesc,
    cap.event,
    r?.payload?.recomendacao,
    r?.payload?.descricao,
    r?.payload?.description
  ]
    .filter(Boolean)
    .join(' ');
}

async function citiesByCapPolygon({ GeoData, polygonText, uf, cache }) {
  const wkt = capPolygonToWkt(polygonText);
  if (!wkt || !GeoData?.sequelize) return [];
  const key = `${uf || 'ALL'}:${wkt}`;
  if (cache.has(key)) return cache.get(key);
  const whereUf = uf ? 'AND state = :uf' : '';
  const [rows] = await GeoData.sequelize.query(
    `SELECT name
       FROM geo_data
      WHERE is_active = true
        AND category = 'municipality'
        ${whereUf}
        AND ST_Intersects(
          geom::geometry,
          ST_SetSRID(ST_GeomFromText(:wkt), 4326)
        )
      ORDER BY name ASC`,
    { replacements: { wkt, uf } }
  );
  const out = (rows || []).map((r) => String(r.name || '').trim()).filter(Boolean);
  cache.set(key, out);
  return out;
}

async function buildOfficialAlertUiItems(rows, stateFilter, cityFilter, GeoData) {
  const uf = stateFilter ? String(stateFilter).toUpperCase() : null;
  const cityNorm = cityFilter ? normalizeCityKey(cityFilter) : null;
  const cache = new Map();
  const out = [];
  for (const r of rows) {
    const statesEffective = reconcileAlertStates(r.states, fullTextForOfficialAlertRow(r));

    if (uf) {
      const byUf = statesEffective.includes(uf);
      if (!byUf) continue;
    }

    const capPolygon = r?.payload?.cap?.polygon;
    let cities = [];
    if (capPolygon) {
      // Usa interseção geoespacial real (municípios x polígono CAP) quando disponível.
      // eslint-disable-next-line no-await-in-loop
      cities = await citiesByCapPolygon({ GeoData, polygonText: capPolygon, uf, cache });
    }
    if (!cities.length) {
      cities = extractCitiesFromRow(r);
    }

    if (cityNorm) {
      if (!cities.length) continue;
      if (!cities.some((c) => normalizeCityKey(c) === cityNorm)) continue;
    }

    const uiId = r.id != null && String(r.id).length ? String(r.id) : r.externalId ? `ext:${r.externalId}` : crypto.randomUUID();
    const desc = r.description || '';
    const titleUi = friendlyInmetDisplayCopy(r.title);
    const descUi = friendlyInmetDisplayCopy(desc);
    out.push(
      buildUiItem({
        id: uiId,
        tipo: titleUi,
        local: cities.length
          ? `Cidades: ${cities.join(', ')}`
          : statesEffective.length
            ? `UF: ${statesEffective.join(', ')}`
            : 'Brasil',
        valorAtual: (descUi || '—').slice(0, 160),
        limiar: `Vigência: ${r.validFrom} a ${r.validTo}`,
        recomendacao: descUi,
        impactoEstimado: 'Aviso meteorológico oficial ingerido (fonte configurada; ver campo fonte).',
        severidade: r.severityRaw || 'moderada',
        severityRaw: r.severityRaw,
        dataIso: r.validFrom,
        fonte: 'inmet'
      })
    );
  }
  return out;
}

function filterNormalizedByOverlapWindow(normalizedList, days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 7));
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  return normalizedList.filter((n) => n.validFrom <= endStr && n.validTo >= startStr);
}

function normalizedListToOfficialRowLikes(normalizedList) {
  return normalizedList.map((n) => ({
    externalId: n.externalId,
    title: n.title,
    description: n.description,
    validFrom: n.validFrom,
    validTo: n.validTo,
    states: n.states,
    severityRaw: n.severityRaw,
    payload: n.payload
  }));
}

/**
 * Produtos explícitos de alerta (JSON) lidos na hora do GET, além do que já está em `official_alerts`.
 * Controlado por `ALERTS_FETCH_LIVE_ON_READ` + `OFFICIAL_ALERT_JSON_URLS` (HTTPS, vírgula).
 */
async function fetchLiveOfficialProductsForRead(days) {
  const on = ['true', '1', 'yes'].includes(String(process.env.ALERTS_FETCH_LIVE_ON_READ || '').toLowerCase());
  if (!on) return [];
  const urls = process.env.OFFICIAL_ALERT_JSON_URLS || '';
  const raw = await inmetAlerts.fetchAlertsFromUrlList(urls);
  return filterNormalizedByOverlapWindow(raw, days);
}

async function loadOfficialAlertsForUi({ OfficialAlert, days }) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 7));
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  return OfficialAlert.findAll({
    where: {
      validFrom: { [Op.lte]: endStr },
      validTo: { [Op.gte]: startStr }
    },
    order: [['validFrom', 'DESC']]
  });
}

module.exports = {
  loadClimateForAlerts,
  deriveAlertsFromClimateRows,
  deriveCptecOutlookAlertsFromClimateRows,
  deriveMetarWindAlertsFromClimateRows,
  buildOfficialAlertUiItems,
  loadOfficialAlertsForUi,
  fetchLiveOfficialProductsForRead,
  normalizedListToOfficialRowLikes,
  buildLegacyAlertsPayload
};
