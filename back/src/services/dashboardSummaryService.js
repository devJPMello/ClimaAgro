const { Op, fn, col } = require('sequelize');
const alertSvc = require('./climateAlertsUiService');

function n(v, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(Number(v).toFixed(digits));
}

function normalizeCityKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function extractCitiesFromUiLocal(local) {
  const text = String(local || '');
  if (!text.startsWith('Cidades: ')) return [];
  return text
    .slice('Cidades: '.length)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractStatesFromUiLocal(local) {
  const text = String(local || '');
  if (!text.startsWith('UF: ')) return [];
  return text
    .slice('UF: '.length)
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z]{2}$/.test(x));
}

/**
 * Monta o JSON esperado pelo `DashboardSummaryDto` do new_front.
 * @param {{ models: object, state?: string }} opts — `state`: sigla UF; se omitido, usa `DEFAULT_APP_UF` (padrão TO).
 */
async function buildDashboardSummary({ models, state: stateParam }) {
  const { ClimateData, GeoData, Productivity, OfficialAlert } = models;

  const defaultUf = (process.env.DEFAULT_APP_UF || 'TO').toString().trim().toUpperCase().slice(0, 2) || 'TO';
  const uf =
    stateParam != null && String(stateParam).trim() !== ''
      ? String(stateParam).toUpperCase().slice(0, 2)
      : defaultUf;

  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const dPrev7End = new Date(now);
  dPrev7End.setDate(dPrev7End.getDate() - 7);
  const dPrev7Start = new Date(now);
  dPrev7Start.setDate(dPrev7Start.getDate() - 14);

  const start7 = d7.toISOString().split('T')[0];
  const start30 = d30.toISOString().split('T')[0];
  const prevStart = dPrev7Start.toISOString().split('T')[0];
  const prevEnd = dPrev7End.toISOString().split('T')[0];

  const stateRow = await GeoData.findOne({
    where: { category: 'state', isActive: true, state: uf },
    order: [['name', 'ASC']]
  });

  const allMuns = await GeoData.findAll({
    where: { state: uf, category: 'municipality', isActive: true },
    order: [['name', 'ASC']]
  });
  const climatePlaces = allMuns.filter((g) => g.properties && String(g.properties.cptecCityQuery || '').trim());

  /** Linhas da tabela + fontes de clima: municípios com CPTEC, senão polígono do estado. */
  const regionRows = climatePlaces.length > 0 ? climatePlaces : stateRow ? [stateRow] : [];

  if (regionRows.length === 0) {
    return {
      kpis: [
        { title: 'Temperatura média', value: '—', metric: 'temperature', color: 'bg-primary' },
        { title: 'Precipitação acumulada (30d)', value: '—', metric: 'precipitation', color: 'bg-chart-2' },
        { title: 'Alertas (7d)', value: '0', metric: 'alerts', color: 'bg-severity-high' },
        { title: 'Produtividade média', value: '—', metric: 'productivity', color: 'bg-severity-low' }
      ],
      regioes: []
    };
  }

  const climateGeoIds = regionRows.map((r) => r.id);
  const prodGeoId = stateRow ? stateRow.id : regionRows[0].id;

  const inClimateIds = { geoDataId: { [Op.in]: climateGeoIds } };

  const kpiTempWhere = { date: { [Op.gte]: start7 }, ...inClimateIds };
  const kpiTempPrevWhere = { date: { [Op.between]: [prevStart, prevEnd] }, ...inClimateIds };
  const kpiRainWhere = { date: { [Op.gte]: start30 }, ...inClimateIds };

  const [kpiTemp] = await ClimateData.findAll({
    attributes: [[fn('AVG', col('avg_temperature')), 'v']],
    where: kpiTempWhere,
    raw: true
  });
  const [kpiTempPrev] = await ClimateData.findAll({
    attributes: [[fn('AVG', col('avg_temperature')), 'v']],
    where: kpiTempPrevWhere,
    raw: true
  });

  const [kpiRain] = await ClimateData.findAll({
    attributes: [[fn('COALESCE', fn('SUM', col('precipitation')), 0), 'v']],
    where: kpiRainWhere,
    raw: true
  });

  const alertClimateRows = await alertSvc.loadClimateForAlerts({
    ClimateData,
    GeoData,
    state: uf,
    days: 7
  });
  const officialRows = await alertSvc.loadOfficialAlertsForUi({ OfficialAlert, days: 7 });
  const liveNormalized = await alertSvc.fetchLiveOfficialProductsForRead(7);
  const dbExternalIds = new Set(officialRows.map((r) => String(r.externalId || '')));
  const liveOnlyNormalized = liveNormalized.filter((x) => !dbExternalIds.has(x.externalId));

  const officialFromDb = await alertSvc.buildOfficialAlertUiItems(officialRows, uf, null, GeoData);
  const officialFromLive = await alertSvc.buildOfficialAlertUiItems(
    alertSvc.normalizedListToOfficialRowLikes(liveOnlyNormalized),
    uf,
    null,
    GeoData
  );
  const includeCptecQualitative = process.env.ENABLE_CPTEC_QUALITATIVE_ALERTS === 'true';
  const cptecOutlook = includeCptecQualitative
    ? alertSvc.deriveCptecOutlookAlertsFromClimateRows(alertClimateRows)
    : [];
  const metarWind = alertSvc.deriveMetarWindAlertsFromClimateRows(alertClimateRows);
  const derivedClimate = alertSvc.deriveAlertsFromClimateRows(alertClimateRows);
  const allAlertItems = [...officialFromDb, ...officialFromLive, ...cptecOutlook, ...metarWind, ...derivedClimate];

  const alertMap = Object.fromEntries(regionRows.map((x) => [x.id, 0]));
  const geoRowsByName = new Map(regionRows.map((x) => [normalizeCityKey(x.name), x.id]));
  for (const item of allAlertItems) {
    const cities = extractCitiesFromUiLocal(item.local);
    if (cities.length > 0) {
      for (const city of cities) {
        const geoId = geoRowsByName.get(normalizeCityKey(city));
        if (geoId) alertMap[geoId] += 1;
      }
      continue;
    }

    const states = extractStatesFromUiLocal(item.local);
    if (states.includes(uf)) {
      for (const row of regionRows) {
        alertMap[row.id] += 1;
      }
      continue;
    }

    const localCity = String(item.local || '')
      .split(' - ')[0]
      .trim();
    const geoId = geoRowsByName.get(normalizeCityKey(localCity));
    if (geoId) alertMap[geoId] += 1;
  }
  const totalAlerts = allAlertItems.length;

  const maxY = await Productivity.max('year');
  const latestYear = maxY || new Date().getFullYear();

  const prodWhere = {
    year: latestYear,
    geoDataId: prodGeoId
  };
  const [kpiProd] = await Productivity.findAll({
    attributes: [[fn('AVG', col('productivity')), 'v']],
    where: prodWhere,
    raw: true
  });

  const tNow = n(kpiTemp?.v, 1);
  const tPrev = n(kpiTempPrev?.v, 1);
  let tempChange = null;
  if (tNow != null && tPrev != null && tPrev !== 0) {
    tempChange = n(((tNow - tPrev) / tPrev) * 100, 1);
  }

  const rainSum = n(kpiRain?.v, 0) ?? 0;

  const regioes = [];
  for (const s of regionRows) {
    const [trow] = await ClimateData.findAll({
      attributes: [[fn('AVG', col('avg_temperature')), 'v']],
      where: { geoDataId: s.id, date: { [Op.gte]: d14.toISOString().split('T')[0] } },
      raw: true
    });
    const [prow] = await ClimateData.findAll({
      attributes: [[fn('COALESCE', fn('SUM', col('precipitation')), 0), 'v']],
      where: { geoDataId: s.id, date: { [Op.gte]: d14.toISOString().split('T')[0] } },
      raw: true
    });
    const prodRow = await Productivity.findOne({
      where: { geoDataId: prodGeoId, year: latestYear },
      order: [['cropType', 'ASC']]
    });
    const [hrow] = await ClimateData.findAll({
      attributes: [[fn('AVG', col('humidity')), 'v']],
      where: { geoDataId: s.id, date: { [Op.gte]: d14.toISOString().split('T')[0] } },
      raw: true
    });
    const [wrow] = await ClimateData.findAll({
      attributes: [[fn('AVG', col('wind_speed')), 'v']],
      where: { geoDataId: s.id, date: { [Op.gte]: d14.toISOString().split('T')[0] } },
      raw: true
    });

    const t = n(trow?.v, 1);
    const p = n(prow?.v, 1) ?? 0;
    const h = n(hrow?.v, 1);
    const w = n(wrow?.v, 1);
    const prodN = prodRow ? n(prodRow.productivity, 2) : null;

    regioes.push({
      uf: s.state,
      estado: s.name,
      temperatura: t != null ? `${t}°C` : '—',
      temperaturaNum: t,
      umidade: h != null ? `${h}%` : '—',
      umidadeNum: h,
      vento: w != null ? `${w} km/h` : '—',
      ventoNum: w,
      precipitacao: `${p}mm`,
      precipitacaoNum: p,
      produtividade: prodRow ? `${n(prodRow.productivity, 1)} t/ha` : '—',
      produtividadeNum: prodN,
      alertas: alertMap[s.id] || 0
    });
  }

  const prodAvg = n(kpiProd?.v, 1);

  const kpis = [
    {
      title: 'Temperatura média',
      value: tNow != null ? `${tNow}°C` : '—',
      change: tempChange != null ? tempChange : undefined,
      metric: 'temperature',
      color: 'bg-primary'
    },
    {
      title: 'Precipitação acumulada (30d)',
      value: `${rainSum}mm`,
      metric: 'precipitation',
      color: 'bg-chart-2'
    },
    {
      title: 'Alertas (7d)',
      value: String(totalAlerts),
      metric: 'alerts',
      color: 'bg-severity-high'
    },
    {
      title: 'Produtividade média',
      value: prodAvg != null ? `${prodAvg} t/ha` : '—',
      metric: 'productivity',
      color: 'bg-severity-low'
    }
  ];

  return { kpis, regioes };
}

module.exports = { buildDashboardSummary };
