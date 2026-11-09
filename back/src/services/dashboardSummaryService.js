const { Op, fn, col } = require('sequelize');
const alertSvc = require('./climateAlertsUiService');
const top5CityDefs = require('../data/dashboardTopTocantinsCities');

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

async function pickDashboardPrincipalUfs(GeoData) {
  const rows = await GeoData.findAll({
    where: { category: 'state', isActive: true, state: { [Op.ne]: null } },
    attributes: ['state'],
    raw: true,
  });
  const unique = [...new Set(rows.map((r) => String(r.state || '').trim().toUpperCase()).filter((v) => /^[A-Z]{2}$/.test(v)))];
  return unique.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function ufFromDerivedAlertLocal(local) {
  const parts = String(local || '')
    .split(' - ')
    .map((x) => x.trim());
  const last = (parts[parts.length - 1] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(last) ? last : null;
}

/** Alerta entra no recorte do dashboard principal (UFs sorteadas)? Usado só para o KPI total. */
function principalDashboardAlertRelevant(item, principalSet, cityStateToId, principalUfs) {
  const ufsFromPrefix = extractStatesFromUiLocal(item.local);
  if (ufsFromPrefix.some((st) => principalSet.has(st))) return true;

  const cities = extractCitiesFromUiLocal(item.local);
  for (const city of cities) {
    for (const st of principalUfs) {
      if (cityStateToId.has(`${normalizeCityKey(city)}|${st}`)) return true;
    }
  }
  if (cities.length > 0) return false;

  const uDer = ufFromDerivedAlertLocal(item.local);
  if (uDer && principalSet.has(uDer)) return true;

  const localCity = String(item.local || '')
    .split(' - ')[0]
    .trim();
  if (!localCity) return false;
  for (const st of principalUfs) {
    if (cityStateToId.has(`${normalizeCityKey(localCity)}|${st}`)) return true;
  }
  return false;
}

/**
 * Dashboard principal: uma linha por UF prioritária (malha estadual em `geo_data`).
 */
async function buildDashboardPrincipalStates({ models, ufs }) {
  const { ClimateData, GeoData, Productivity, OfficialAlert } = models;
  const principalUfs = Array.isArray(ufs) && ufs.length ? ufs : await pickDashboardPrincipalUfs(GeoData);
  const principalSet = new Set(principalUfs);

  const allStateRows = await GeoData.findAll({
    where: { category: 'state', isActive: true, state: { [Op.in]: principalUfs } },
    attributes: ['id', 'name', 'state'],
    order: [['name', 'ASC']]
  });
  const stateRowMap = new Map(allStateRows.map((r) => [String(r.state).toUpperCase(), r]));
  const stateRows = principalUfs.map((sig) => stateRowMap.get(sig)).filter(Boolean);

  if (stateRows.length === 0) {
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
  const since14Str = d14.toISOString().split('T')[0];

  const climateGeoIds = stateRows.map((r) => r.id);
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
  // Média, entre as localidades, da chuva acumulada em 30 dias (somar todas as localidades
  // daria um total sem sentido físico, ex.: 27 UFs × ~80 mm).
  const [kpiRain] = await ClimateData.findAll({
    attributes: [
      [fn('COALESCE', fn('SUM', col('precipitation')), 0), 'sum'],
      [fn('COUNT', fn('DISTINCT', col('geo_data_id'))), 'locs']
    ],
    where: { ...kpiRainWhere, precipitation: { [Op.ne]: null } },
    raw: true
  });

  const alertClimateBlocks = await Promise.all(
    principalUfs.map((st) =>
      alertSvc.loadClimateForAlerts({ ClimateData, GeoData, state: st, days: 7 })
    )
  );
  const alertClimateRows = alertClimateBlocks.flat();

  const officialRows = await alertSvc.loadOfficialAlertsForUi({ OfficialAlert, days: 7 });
  const liveNormalized = await alertSvc.fetchLiveOfficialProductsForRead(7);
  const dbExternalIds = new Set(officialRows.map((r) => String(r.externalId || '')));
  const liveOnlyNormalized = liveNormalized.filter((x) => !dbExternalIds.has(x.externalId));

  const officialFromDb = await alertSvc.buildOfficialAlertUiItems(officialRows, null, null, GeoData);
  const officialFromLive = await alertSvc.buildOfficialAlertUiItems(
    alertSvc.normalizedListToOfficialRowLikes(liveOnlyNormalized),
    null,
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

  const muns = await GeoData.findAll({
    where: { category: 'municipality', isActive: true, state: { [Op.in]: principalUfs } },
    attributes: ['id', 'name', 'state']
  });
  const cityStateToId = new Map();
  for (const m of muns) {
    cityStateToId.set(`${normalizeCityKey(m.name)}|${String(m.state).toUpperCase()}`, m.id);
  }

  const alertMap = Object.fromEntries(stateRows.map((x) => [x.id, 0]));
  const stateIdByUf = new Map(stateRows.map((s) => [String(s.state).toUpperCase(), s.id]));

  for (const item of allAlertItems) {
    const ufsFromPrefix = extractStatesFromUiLocal(item.local);
    if (ufsFromPrefix.length) {
      for (const st of ufsFromPrefix) {
        if (principalSet.has(st)) {
          const sid = stateIdByUf.get(st);
          if (sid) alertMap[sid] += 1;
        }
      }
      continue;
    }
    const cities = extractCitiesFromUiLocal(item.local);
    if (cities.length) {
      for (const city of cities) {
        let matched = false;
        for (const st of principalUfs) {
          if (cityStateToId.has(`${normalizeCityKey(city)}|${st}`)) {
            const sid = stateIdByUf.get(st);
            if (sid) alertMap[sid] += 1;
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
      continue;
    }
    const uDer = ufFromDerivedAlertLocal(item.local);
    if (uDer && principalSet.has(uDer)) {
      const sid = stateIdByUf.get(uDer);
      if (sid) alertMap[sid] += 1;
      continue;
    }
    const localCity = String(item.local || '')
      .split(' - ')[0]
      .trim();
    if (localCity) {
      for (const st of principalUfs) {
        if (cityStateToId.has(`${normalizeCityKey(localCity)}|${st}`)) {
          const sid = stateIdByUf.get(st);
          if (sid) alertMap[sid] += 1;
          break;
        }
      }
    }
  }

  const totalAlerts = allAlertItems.filter((item) =>
    principalDashboardAlertRelevant(item, principalSet, cityStateToId, principalUfs)
  ).length;

  let latestYear = await Productivity.max('year', { where: { state: { [Op.in]: principalUfs } } });
  if (latestYear == null) latestYear = await Productivity.max('year');
  latestYear = latestYear != null ? Number(latestYear) : new Date().getFullYear();

  const [kpiProd] = await Productivity.findAll({
    attributes: [[fn('AVG', col('productivity')), 'v']],
    where: { state: { [Op.in]: principalUfs }, year: latestYear },
    raw: true
  });

  const tNow = n(kpiTemp?.v, 1);
  const tPrev = n(kpiTempPrev?.v, 1);
  let tempChange = null;
  if (tNow != null && tPrev != null && tPrev !== 0) {
    tempChange = n(((tNow - tPrev) / tPrev) * 100, 1);
  }
  const rainLocs = Number(kpiRain?.locs) || 0;
  const rainSum = rainLocs > 0 ? n(Number(kpiRain.sum) / rainLocs, 0) ?? 0 : 0;

  const geoIdsForClimate = stateRows.map((r) => r.id);
  const climateByGeoId = new Map();
  if (geoIdsForClimate.length) {
    const statRows = await ClimateData.findAll({
      attributes: [
        'geoDataId',
        [fn('AVG', col('avg_temperature')), 'avgT'],
        [fn('COALESCE', fn('SUM', col('precipitation')), 0), 'sumP'],
        [fn('AVG', col('humidity')), 'avgH'],
        [fn('AVG', col('wind_speed')), 'avgW']
      ],
      where: {
        geoDataId: { [Op.in]: geoIdsForClimate },
        date: { [Op.gte]: since14Str }
      },
      group: ['geoDataId'],
      raw: true
    });
    for (const row of statRows) {
      climateByGeoId.set(String(row.geoDataId), row);
    }
  }

  const prodGroupRows = await Productivity.findAll({
    attributes: ['state', [fn('AVG', col('productivity')), 'v']],
    where: { state: { [Op.in]: principalUfs }, year: latestYear },
    group: ['state'],
    raw: true
  });
  const prodMap = new Map(prodGroupRows.map((x) => [String(x.state).toUpperCase(), x]));

  const regioes = [];
  for (const s of stateRows) {
    const st = climateByGeoId.get(String(s.id));
    const t = n(st?.avgT, 1);
    const p = n(st?.sumP, 1) ?? 0;
    const h = n(st?.avgH, 1);
    const w = n(st?.avgW, 1);
    const ufKey = String(s.state).toUpperCase();
    const aggProd = prodMap.get(ufKey);
    const prodN = n(aggProd?.v, 2);

    regioes.push({
      uf: ufKey,
      estado: s.name,
      temperatura: t != null ? `${t}°C` : '—',
      temperaturaNum: t,
      umidade: h != null ? `${h}%` : '—',
      umidadeNum: h,
      vento: w != null ? `${w} km/h` : '—',
      ventoNum: w,
      precipitacao: `${p}mm`,
      precipitacaoNum: p,
      produtividade: prodN != null && aggProd?.v != null ? `${n(aggProd.v, 1)} t/ha` : '—',
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

/**
 * Monta o JSON esperado pelo `DashboardSummaryDto` do new_front.
 * @param {{ models: object, state?: string }} opts — `state`: sigla UF (ex.: TO) para visão municipal daquela UF;
 *   se omitido, resumo principal com MT, TO, GO, SP e MG (nível estadual).
 */
async function buildDashboardSummary({ models, state: stateParam }) {
  const { ClimateData, GeoData, Productivity, OfficialAlert } = models;

  const trimmed =
    stateParam != null && String(stateParam).trim() !== '' ? String(stateParam).trim().toUpperCase().slice(0, 2) : '';
  if (!trimmed) {
    return buildDashboardPrincipalStates({ models });
  }
  // UF escolhida (ex.: a do perfil do usuário): mesma visão estadual do resumo principal, só para ela.
  if (/^[A-Z]{2}$/.test(trimmed) && process.env.DASHBOARD_STATE_VIEW !== 'municipal') {
    return buildDashboardPrincipalStates({ models, ufs: [trimmed] });
  }
  const uf = trimmed;

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
  /** Todos os municípios TO em geo_data (Open-Meteo / CPTEC por cidade); senão visão estadual. */
  const regionRows = allMuns.length > 0 ? allMuns : stateRow ? [stateRow] : [];

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

  // Média, entre as localidades, da chuva acumulada em 30 dias (somar todas as localidades
  // daria um total sem sentido físico, ex.: 27 UFs × ~80 mm).
  const [kpiRain] = await ClimateData.findAll({
    attributes: [
      [fn('COALESCE', fn('SUM', col('precipitation')), 0), 'sum'],
      [fn('COUNT', fn('DISTINCT', col('geo_data_id'))), 'locs']
    ],
    where: { ...kpiRainWhere, precipitation: { [Op.ne]: null } },
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

  let latestYear = await Productivity.max('year', { where: { state: uf } });
  if (latestYear == null) latestYear = await Productivity.max('year');
  latestYear = latestYear != null ? Number(latestYear) : new Date().getFullYear();

  /** Média estadual (todos os registros SIDRA/APP do ano na UF), não o polígono `geo_data` do estado. */
  const [kpiProd] = await Productivity.findAll({
    attributes: [[fn('AVG', col('productivity')), 'v']],
    where: { state: uf, year: latestYear },
    raw: true
  });

  const tNow = n(kpiTemp?.v, 1);
  const tPrev = n(kpiTempPrev?.v, 1);
  let tempChange = null;
  if (tNow != null && tPrev != null && tPrev !== 0) {
    tempChange = n(((tNow - tPrev) / tPrev) * 100, 1);
  }

  const rainLocs = Number(kpiRain?.locs) || 0;
  const rainSum = rainLocs > 0 ? n(Number(kpiRain.sum) / rainLocs, 0) ?? 0 : 0;

  const since14Str = d14.toISOString().split('T')[0];
  const geoIdsForClimate = regionRows.map((r) => r.id);

  const climateByGeoId = new Map();
  if (geoIdsForClimate.length > 0) {
    const statRows = await ClimateData.findAll({
      attributes: [
        'geoDataId',
        [fn('AVG', col('avg_temperature')), 'avgT'],
        [fn('COALESCE', fn('SUM', col('precipitation')), 0), 'sumP'],
        [fn('AVG', col('humidity')), 'avgH'],
        [fn('AVG', col('wind_speed')), 'avgW']
      ],
      where: {
        geoDataId: { [Op.in]: geoIdsForClimate },
        date: { [Op.gte]: since14Str }
      },
      group: ['geoDataId'],
      raw: true
    });
    for (const row of statRows) {
      climateByGeoId.set(String(row.geoDataId), row);
    }
  }

  const top5GeoRows = [];
  for (const def of top5CityDefs) {
    const g = allMuns.find((m) => m.name === def.name);
    if (g) top5GeoRows.push(g);
  }

  const prodByGeoId = await Promise.all(
    top5GeoRows.map(async (s) => {
      const code7 =
        s.ibgeCode != null && String(s.ibgeCode).replace(/\D/g, '').length >= 7
          ? String(s.ibgeCode).replace(/\D/g, '').padStart(7, '0').slice(0, 7)
          : '';
      const prodWhere = {
        state: uf,
        year: latestYear,
        [Op.or]: [{ geoDataId: s.id }, ...(code7 ? [{ municipalityIbgeCode: code7 }] : [])]
      };
      const [aggProd] = await Productivity.findAll({
        attributes: [[fn('AVG', col('productivity')), 'v']],
        where: prodWhere,
        raw: true
      });
      return { geoId: s.id, aggProd };
    })
  );
  const prodMap = new Map(prodByGeoId.map((x) => [String(x.geoId), x.aggProd]));

  const regioes = [];
  for (const s of top5GeoRows) {
    const st = climateByGeoId.get(String(s.id));
    const t = n(st?.avgT, 1);
    const p = n(st?.sumP, 1) ?? 0;
    const h = n(st?.avgH, 1);
    const w = n(st?.avgW, 1);
    const aggProd = prodMap.get(String(s.id));
    const prodN = n(aggProd?.v, 2);

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
      produtividade: prodN != null && aggProd?.v != null ? `${n(aggProd.v, 1)} t/ha` : '—',
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
