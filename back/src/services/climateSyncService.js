const cptec = require('./cptecClient');
const inmet = require('./inmetClient');
const openMeteo = require('./openMeteoClient');
const STATE_CAPITAL = require('../data/brazilStateCapitalCptecQuery');
const STATE_ICAO = require('../data/brazilStateCapitalIcao');
const TOCANTINS_CITIES = require('../data/tocantinsCitiesCptec');
const { isPrecipitationLikelyFromTempoCode } = require('../data/cptecRainTempoCodes');
const inmetAlerts = require('./inmetAlertsClient');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function brDateOnly() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function mergeMetadata(prev, patch) {
  return { ...(prev && typeof prev === 'object' ? prev : {}), ...patch };
}

/**
 * Sincroniza previsão CPTEC (7 dias) por capital + METAR do aeroporto da capital (umidade, vento, pressão).
 * Chuva em mm no produto municipal não existe — ver DATA_SOURCES.md; `metadata.cptec` guarda sigla oficial.
 */
async function syncCptecForStates({ ClimateData, GeoData, transaction }) {
  if (process.env.ENABLE_CPTEC_SYNC === 'false') {
    return { skipped: true, reason: 'ENABLE_CPTEC_SYNC=false' };
  }

  const useMetar = process.env.ENABLE_CPTEC_METAR !== 'false';

  // Não carregar `geom` — polígonos estaduais são pesados e o primeiro SELECT parece “travar”.
  const states = await GeoData.findAll({
    where: { category: 'state', isActive: true },
    attributes: ['id', 'state', 'name'],
    transaction
  });

  const results = { upserted: 0, metarMerged: 0, errors: [] };
  const today = brDateOnly();
  console.log(`[sync:climate] CPTEC: ${states.length} UF(s)…`);

  for (const g of states) {
    const uf = (g.state || '').toUpperCase();
    if (!uf) continue;
    console.log(`[sync:climate] CPTEC → ${uf}`);
    const cityQ = STATE_CAPITAL[uf];
    const icao = STATE_ICAO[uf];
    if (!cityQ) {
      results.errors.push({ state: uf, message: 'Capital CPTEC não mapeada' });
      continue;
    }
    try {
      const localityId = await cptec.pickLocalityIdForState(cityQ, uf);
      if (!localityId) {
        results.errors.push({ state: uf, message: 'Localidade CPTEC não encontrada' });
        continue;
      }
      const fc = await cptec.fetchForecast7DaysByLocalityId(localityId);
      if (!fc.forecasts.length) {
        results.errors.push({ state: uf, message: 'Previsão CPTEC vazia' });
        continue;
      }

      for (const f of fc.forecasts) {
        const dateStr = f.dia;
        const y = parseInt(dateStr.slice(0, 4), 10);
        const m = parseInt(dateStr.slice(5, 7), 10);
        const d = parseInt(dateStr.slice(8, 10), 10);
        const avg = (f.maxima + f.minima) / 2;
        const md = {
          cptec: {
            tempo: f.tempo,
            iuv: f.iuv,
            precipitacaoQualitativa: isPrecipitationLikelyFromTempoCode(f.tempo) ? 'prevista' : 'nao_prevista'
          }
        };

        const [row] = await ClimateData.findOrCreate({
          where: { geoDataId: g.id, date: dateStr },
          defaults: {
            uf,
            year: y,
            month: m,
            day: d,
            avgTemperature: avg,
            maxTemperature: f.maxima,
            minTemperature: f.minima,
            precipitation: null,
            humidity: null,
            windSpeed: null,
            windDirection: null,
            atmosphericPressure: null,
            dataSource: 'cptec',
            weatherStation: fc.nome || cityQ,
            stationCode: `CPTEC:${localityId}`,
            dataQuality: 72,
            status: 'preliminar',
            metadata: md
          },
          transaction
        });

        const mergedMd = mergeMetadata(row.metadata, md);
        await row.update(
          {
            uf,
            avgTemperature: avg,
            maxTemperature: f.maxima,
            minTemperature: f.minima,
            dataSource: 'cptec',
            weatherStation: fc.nome || row.weatherStation,
            stationCode: `CPTEC:${localityId}`,
            metadata: mergedMd,
            status: 'preliminar'
          },
          { transaction }
        );
        results.upserted += 1;
      }

      if (useMetar && icao) {
        try {
          const met = await cptec.fetchMetarByIcao(icao);
          const hasNumeric =
            met.umidade != null || met.vento_int != null || met.pressao != null || met.temperatura != null;
          if (hasNumeric) {
            const dayRow = await ClimateData.findOne({
              where: { geoDataId: g.id, date: today },
              transaction
            });
            if (dayRow) {
              const meta = mergeMetadata(dayRow.metadata, {
                cptecMetar: {
                  icao,
                  atualizacao: met.atualizacao,
                  tempo: met.tempo,
                  tempo_desc: met.tempo_desc
                }
              });
              const patch = { metadata: meta };
              if (met.umidade != null) patch.humidity = met.umidade;
              if (met.vento_int != null) patch.windSpeed = met.vento_int;
              if (met.vento_dir != null) patch.windDirection = met.vento_dir;
              if (met.pressao != null) patch.atmosphericPressure = met.pressao;
              if (met.temperatura != null) {
                const curAvg = dayRow.avgTemperature != null ? Number(dayRow.avgTemperature) : null;
                patch.avgTemperature =
                  curAvg != null && Number.isFinite(curAvg) ? (curAvg + met.temperatura) / 2 : met.temperatura;
              }
              if (dayRow.stationCode && !String(dayRow.stationCode).includes('METAR')) {
                patch.stationCode = `${dayRow.stationCode}+METAR:${icao}`.slice(0, 80);
              }
              await dayRow.update(patch, { transaction });
              results.metarMerged += 1;
            }
          }
        } catch (e) {
          results.errors.push({ state: uf, phase: 'metar', message: e.message || String(e) });
        }
      }

      await sleep(Number(process.env.CPTEC_SYNC_DELAY_MS || 120));
    } catch (e) {
      results.errors.push({ state: uf, message: e.message || String(e) });
    }
  }

  return results;
}

/**
 * CPTEC 7 dias por município do Tocantins (geo_data com `properties.cptecCityQuery`).
 * METAR apenas onde `metarIcao` estiver definido (ex.: Palmas / SBPJ).
 */
async function syncCptecForTocantinsMunicipalities({ ClimateData, GeoData, transaction }) {
  if (process.env.ENABLE_CPTEC_SYNC === 'false') {
    return { skipped: true, reason: 'ENABLE_CPTEC_SYNC=false' };
  }
  const useMetar = process.env.ENABLE_CPTEC_METAR !== 'false';
  const results = { upserted: 0, metarMerged: 0, errors: [], scope: 'tocantins' };
  const today = brDateOnly();

  for (const def of TOCANTINS_CITIES) {
    const g = await GeoData.findOne({
      where: { name: def.name, state: 'TO', category: 'municipality', isActive: true },
      transaction
    });
    if (!g) {
      results.errors.push({ city: def.name, message: 'geo_data não encontrado (rode npm run seed:geo)' });
      continue;
    }
    const cityQ = def.cptecCityQuery;
    const uf = 'TO';
    try {
      const localityId = await cptec.pickLocalityIdForState(cityQ, uf);
      if (!localityId) {
        results.errors.push({ city: def.name, message: 'Localidade CPTEC não encontrada' });
        continue;
      }
      const fc = await cptec.fetchForecast7DaysByLocalityId(localityId);
      if (!fc.forecasts.length) {
        results.errors.push({ city: def.name, message: 'Previsão CPTEC vazia' });
        continue;
      }

      for (const f of fc.forecasts) {
        const dateStr = f.dia;
        const y = parseInt(dateStr.slice(0, 4), 10);
        const m = parseInt(dateStr.slice(5, 7), 10);
        const d = parseInt(dateStr.slice(8, 10), 10);
        const avg = (f.maxima + f.minima) / 2;
        const md = {
          cptec: {
            tempo: f.tempo,
            iuv: f.iuv,
            precipitacaoQualitativa: isPrecipitationLikelyFromTempoCode(f.tempo) ? 'prevista' : 'nao_prevista'
          }
        };

        const [row] = await ClimateData.findOrCreate({
          where: { geoDataId: g.id, date: dateStr },
          defaults: {
            uf,
            year: y,
            month: m,
            day: d,
            avgTemperature: avg,
            maxTemperature: f.maxima,
            minTemperature: f.minima,
            precipitation: null,
            humidity: null,
            windSpeed: null,
            windDirection: null,
            atmosphericPressure: null,
            dataSource: 'cptec',
            weatherStation: fc.nome || def.name,
            stationCode: `CPTEC:${localityId}`,
            dataQuality: 72,
            status: 'preliminar',
            metadata: md
          },
          transaction
        });

        const mergedMd = mergeMetadata(row.metadata, md);
        await row.update(
          {
            uf,
            avgTemperature: avg,
            maxTemperature: f.maxima,
            minTemperature: f.minima,
            dataSource: 'cptec',
            weatherStation: fc.nome || row.weatherStation,
            stationCode: `CPTEC:${localityId}`,
            metadata: mergedMd,
            status: 'preliminar'
          },
          { transaction }
        );
        results.upserted += 1;
      }

      const icao = def.metarIcao && useMetar ? String(def.metarIcao).toUpperCase() : null;
      if (icao) {
        try {
          const met = await cptec.fetchMetarByIcao(icao);
          const hasNumeric =
            met.umidade != null || met.vento_int != null || met.pressao != null || met.temperatura != null;
          if (hasNumeric) {
            const dayRow = await ClimateData.findOne({
              where: { geoDataId: g.id, date: today },
              transaction
            });
            if (dayRow) {
              const meta = mergeMetadata(dayRow.metadata, {
                cptecMetar: {
                  icao,
                  atualizacao: met.atualizacao,
                  tempo: met.tempo,
                  tempo_desc: met.tempo_desc
                }
              });
              const patch = { metadata: meta };
              if (met.umidade != null) patch.humidity = met.umidade;
              if (met.vento_int != null) patch.windSpeed = met.vento_int;
              if (met.vento_dir != null) patch.windDirection = met.vento_dir;
              if (met.pressao != null) patch.atmosphericPressure = met.pressao;
              if (met.temperatura != null) {
                const curAvg = dayRow.avgTemperature != null ? Number(dayRow.avgTemperature) : null;
                patch.avgTemperature =
                  curAvg != null && Number.isFinite(curAvg) ? (curAvg + met.temperatura) / 2 : met.temperatura;
              }
              if (dayRow.stationCode && !String(dayRow.stationCode).includes('METAR')) {
                patch.stationCode = `${dayRow.stationCode}+METAR:${icao}`.slice(0, 80);
              }
              await dayRow.update(patch, { transaction });
              results.metarMerged += 1;
            }
          }
        } catch (e) {
          results.errors.push({ city: def.name, phase: 'metar', message: e.message || String(e) });
        }
      }

      await sleep(Number(process.env.CPTEC_SYNC_DELAY_MS || 120));
    } catch (e) {
      results.errors.push({ city: def.name, message: e.message || String(e) });
    }
  }

  return results;
}

/**
 * Open-Meteo diário por **todos** os municípios TO em `geo_data` (ponto + ibge_code).
 * Modelo/reanálise Open-Meteo nas coordenadas do registo — `npm run geo:geocode-tocantins` atualiza sedes.
 * CPTEC permanece só nas cidades de `tocantinsCitiesCptec.js`.
 */
async function syncOpenMeteoForTocantinsMunicipalities({ ClimateData, GeoData, transaction }) {
  if (process.env.ENABLE_OPEN_METEO_SYNC === 'false') {
    return { skipped: true, reason: 'ENABLE_OPEN_METEO_SYNC=false' };
  }

  const daysBack = Number(process.env.OPEN_METEO_PAST_DAYS || 7);
  const daysForward = Number(process.env.OPEN_METEO_FORECAST_DAYS || 7);
  const interCityDelayMs = Number(process.env.OPEN_METEO_SYNC_DELAY_MS || 120);
  const results = {
    upserted: 0,
    skippedCities: 0,
    citiesProcessed: 0,
    errors: [],
    scope: 'tocantins'
  };

  const municipalities = await GeoData.findAll({
    where: { state: 'TO', category: 'municipality', isActive: true },
    order: [['name', 'ASC']],
    transaction
  });

  for (const g of municipalities) {
    const cityName = String(g.name || '').trim() || '—';
    if (!g.geom || !Array.isArray(g.geom.coordinates)) {
      results.skippedCities += 1;
      results.errors.push({ city: cityName, message: 'Município sem geom ponto em geo_data.' });
      continue;
    }

    const lon = Number(g.geom.coordinates[0]);
    const lat = Number(g.geom.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      results.skippedCities += 1;
      results.errors.push({ city: cityName, message: 'Coordenadas inválidas no geo_data.' });
      continue;
    }

    const ibge = g.ibgeCode ? String(g.ibgeCode).replace(/\D/g, '').slice(0, 7) : '';

    try {
      // eslint-disable-next-line no-await-in-loop
      const payload = await openMeteo.fetchForecastDailyByCoords({
        lat,
        lon,
        daysBack,
        daysForward
      });
      const rows = openMeteo.dailyToRows(payload);
      if (!rows.length) {
        results.skippedCities += 1;
        results.errors.push({ city: cityName, message: 'Open-Meteo retornou série vazia.' });
        // eslint-disable-next-line no-await-in-loop
        await sleep(interCityDelayMs);
        continue;
      }

      results.citiesProcessed += 1;

      for (const r of rows) {
        const y = parseInt(String(r.date).slice(0, 4), 10);
        const m = parseInt(String(r.date).slice(5, 7), 10);
        const d = parseInt(String(r.date).slice(8, 10), 10);
        const avgT =
          r.avgTemperature != null
            ? r.avgTemperature
            : r.maxTemperature != null && r.minTemperature != null
              ? (r.maxTemperature + r.minTemperature) / 2
              : r.maxTemperature ?? r.minTemperature;
        const md = {
          openMeteo: {
            latitude: lat,
            longitude: lon,
            timezone: payload.timezone || process.env.OPEN_METEO_TIMEZONE || 'America/Sao_Paulo',
            model: payload.generationtime_ms != null ? 'open-meteo' : 'open-meteo-forecast'
          }
        };

        // eslint-disable-next-line no-await-in-loop
        const [row] = await ClimateData.findOrCreate({
          where: { geoDataId: g.id, date: r.date },
          defaults: {
            uf: 'TO',
            year: y,
            month: m,
            day: d,
            avgTemperature: avgT,
            maxTemperature: r.maxTemperature,
            minTemperature: r.minTemperature,
            precipitation: r.precipitation,
            humidity: r.humidity,
            windSpeed: r.windSpeed,
            windDirection: r.windDirection,
            atmosphericPressure: r.atmosphericPressure,
            dataSource: 'outros',
            weatherStation: `Open-Meteo ${cityName}`,
            stationCode: `OPENMETEO:${ibge || cityName}`.slice(0, 80),
            dataQuality: 85,
            status: 'preliminar',
            metadata: md
          },
          transaction
        });

        const mergedMd = mergeMetadata(row.metadata, md);
        // eslint-disable-next-line no-await-in-loop
        await row.update(
          {
            uf: 'TO',
            avgTemperature: avgT ?? row.avgTemperature,
            maxTemperature: r.maxTemperature ?? row.maxTemperature,
            minTemperature: r.minTemperature ?? row.minTemperature,
            precipitation: r.precipitation ?? row.precipitation,
            humidity: r.humidity ?? row.humidity,
            windSpeed: r.windSpeed ?? row.windSpeed,
            windDirection: r.windDirection ?? row.windDirection,
            atmosphericPressure: r.atmosphericPressure ?? row.atmosphericPressure,
            dataSource: 'outros',
            weatherStation: `Open-Meteo ${cityName}`,
            stationCode: `OPENMETEO:${ibge || cityName}`.slice(0, 80),
            metadata: mergedMd,
            status: 'preliminar'
          },
          { transaction }
        );

        results.upserted += 1;
      }
    } catch (e) {
      results.errors.push({ city: cityName, message: e.message || String(e) });
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(interCityDelayMs);
  }

  return results;
}

/**
 * Open-Meteo diário por UF (geometria estadual em geo_data/category=state).
 * Usa centroide do polígono estadual para obter uma série representativa por estado.
 */
async function syncOpenMeteoForStates({ sequelize, ClimateData, GeoData, transaction }) {
  if (process.env.ENABLE_OPEN_METEO_SYNC === 'false') {
    return { skipped: true, reason: 'ENABLE_OPEN_METEO_SYNC=false' };
  }

  const daysBack = Number(process.env.OPEN_METEO_PAST_DAYS || 7);
  const daysForward = Number(process.env.OPEN_METEO_FORECAST_DAYS || 7);
  const interStateDelayMs = Number(process.env.OPEN_METEO_SYNC_DELAY_MS || 120);
  const results = {
    upserted: 0,
    skippedStates: 0,
    statesProcessed: 0,
    errors: [],
    scope: 'brasil'
  };

  const states = await GeoData.findAll({
    where: { category: 'state', isActive: true },
    order: [['state', 'ASC']],
    attributes: ['id', 'state', 'name'],
    transaction
  });

  console.log(`[sync:climate] Open-Meteo: ${states.length} UF(s), centroide via SQL…`);

  for (const g of states) {
    const uf = String(g.state || '').trim().toUpperCase().slice(0, 2);
    if (!uf) {
      results.skippedStates += 1;
      continue;
    }

    console.log(`[sync:climate] Open-Meteo → ${uf}`);

    let lat = null;
    let lon = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await sequelize.query(
        `
        SELECT
          ST_Y(ST_Centroid(geom::geometry))::float AS lat,
          ST_X(ST_Centroid(geom::geometry))::float AS lon
        FROM geo_data
        WHERE id = :geoDataId
        LIMIT 1
        `,
        { replacements: { geoDataId: g.id }, transaction }
      );
      lat = Number(rows?.[0]?.lat);
      lon = Number(rows?.[0]?.lon);
    } catch (e) {
      results.errors.push({ state: uf, message: `Falha ao calcular centroide: ${e.message || String(e)}` });
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      results.skippedStates += 1;
      results.errors.push({ state: uf, message: 'Sem coordenadas válidas para consulta Open-Meteo.' });
      // eslint-disable-next-line no-await-in-loop
      await sleep(interStateDelayMs);
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const payload = await openMeteo.fetchForecastDailyByCoords({
        lat,
        lon,
        daysBack,
        daysForward
      });
      const rows = openMeteo.dailyToRows(payload);
      if (!rows.length) {
        results.skippedStates += 1;
        results.errors.push({ state: uf, message: 'Open-Meteo retornou série vazia.' });
        // eslint-disable-next-line no-await-in-loop
        await sleep(interStateDelayMs);
        continue;
      }

      results.statesProcessed += 1;
      for (const r of rows) {
        const y = parseInt(String(r.date).slice(0, 4), 10);
        const m = parseInt(String(r.date).slice(5, 7), 10);
        const d = parseInt(String(r.date).slice(8, 10), 10);
        const avgT =
          r.avgTemperature != null
            ? r.avgTemperature
            : r.maxTemperature != null && r.minTemperature != null
              ? (r.maxTemperature + r.minTemperature) / 2
              : r.maxTemperature ?? r.minTemperature;
        const md = {
          openMeteo: {
            latitude: lat,
            longitude: lon,
            timezone: payload.timezone || process.env.OPEN_METEO_TIMEZONE || 'America/Sao_Paulo',
            model: payload.generationtime_ms != null ? 'open-meteo' : 'open-meteo-forecast',
            scope: 'state'
          }
        };

        // eslint-disable-next-line no-await-in-loop
        const [row] = await ClimateData.findOrCreate({
          where: { geoDataId: g.id, date: r.date },
          defaults: {
            uf,
            year: y,
            month: m,
            day: d,
            avgTemperature: avgT,
            maxTemperature: r.maxTemperature,
            minTemperature: r.minTemperature,
            precipitation: r.precipitation,
            humidity: r.humidity,
            windSpeed: r.windSpeed,
            windDirection: r.windDirection,
            atmosphericPressure: r.atmosphericPressure,
            dataSource: 'outros',
            weatherStation: `Open-Meteo ${uf}`,
            stationCode: `OPENMETEO-UF:${uf}`,
            dataQuality: 85,
            status: 'preliminar',
            metadata: md
          },
          transaction
        });

        const mergedMd = mergeMetadata(row.metadata, md);
        // eslint-disable-next-line no-await-in-loop
        await row.update(
          {
            uf,
            avgTemperature: avgT ?? row.avgTemperature,
            maxTemperature: r.maxTemperature ?? row.maxTemperature,
            minTemperature: r.minTemperature ?? row.minTemperature,
            precipitation: r.precipitation ?? row.precipitation,
            humidity: r.humidity ?? row.humidity,
            windSpeed: r.windSpeed ?? row.windSpeed,
            windDirection: r.windDirection ?? row.windDirection,
            atmosphericPressure: r.atmosphericPressure ?? row.atmosphericPressure,
            dataSource: 'outros',
            weatherStation: `Open-Meteo ${uf}`,
            stationCode: `OPENMETEO-UF:${uf}`,
            metadata: mergedMd,
            status: 'preliminar'
          },
          { transaction }
        );
        results.upserted += 1;
      }
    } catch (e) {
      results.errors.push({ state: uf, message: e.message || String(e) });
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(interStateDelayMs);
  }

  return results;
}

/**
 * INMET avisos via JSON (URL configurável). Ver DATA_SOURCES.md.
 */
async function syncOfficialAlertsFromJson({ OfficialAlert, transaction }) {
  if (process.env.ENABLE_INMET_ALERTS_SYNC !== 'true') {
    return { skipped: true, reason: 'ENABLE_INMET_ALERTS_SYNC não é true' };
  }
  const url = process.env.INMET_ALERTS_JSON_URL;
  if (!url) {
    return {
      skipped: true,
      reason:
        'INMET_ALERTS_JSON_URL não configurada — publique JSON no contrato (DATA_SOURCES.md) a partir dos avisos INMET ou ETL.'
    };
  }
  try {
    const raw = await inmetAlerts.fetchAlertsJson(url);
    const items = inmetAlerts.normalizeBundle(raw);
    if (!items.length) {
      return { upserted: 0, message: 'Nenhum item no JSON de alertas.' };
    }
    let upserted = 0;
    for (const it of items) {
      const [row] = await OfficialAlert.findOrCreate({
        where: { source: 'inmet', externalId: it.externalId },
        defaults: {
          severityRaw: it.severityRaw,
          title: it.title.slice(0, 500),
          description: it.description || null,
          validFrom: it.validFrom,
          validTo: it.validTo,
          states: it.states,
          payload: it.payload
        },
        transaction
      });
      await row.update(
        {
          severityRaw: it.severityRaw,
          title: it.title.slice(0, 500),
          description: it.description || null,
          validFrom: it.validFrom,
          validTo: it.validTo,
          states: it.states,
          payload: it.payload
        },
        { transaction }
      );
      upserted += 1;
    }
    return { upserted };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

async function syncInmetFromConfiguredUrl({ sequelize, ClimateData, GeoData, transaction }) {
  if (process.env.ENABLE_INMET_SYNC === 'false') {
    return { skipped: true, reason: 'ENABLE_INMET_SYNC=false' };
  }
  const url = process.env.INMET_SYNC_ITEMS_URL;
  if (!url) {
    return {
      skipped: true,
      reason:
        'INMET_SYNC_ITEMS_URL não configurada — defina uma URL absoluta de items/coleção OGC conforme catálogo INMET (wis2bra.inmet.gov.br/oapi).'
    };
  }

  let data;
  try {
    data = await inmet.fetchGeoJsonFromUrl(url);
  } catch (e) {
    return { skipped: true, reason: e.message || String(e) };
  }

  const features = data && Array.isArray(data.features) ? data.features : [];
  const results = { upserted: 0, skippedFeatures: 0, errors: [] };

  for (const f of features) {
    const n = inmet.normalizeFeature(f);
    if (!n.date || (n.avgTemperature == null && n.maxTemperature == null && n.minTemperature == null)) {
      results.skippedFeatures += 1;
      continue;
    }
    let geoId = null;
    if (n.lon != null && n.lat != null) {
      try {
        const [rows] = await sequelize.query(
          `SELECT id::text AS id FROM geo_data
           WHERE is_active = true AND category = 'state'
             AND ST_Contains(geom::geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
           LIMIT 1`,
          { replacements: { lon: n.lon, lat: n.lat }, transaction }
        );
        geoId = rows[0]?.id || null;
      } catch (e) {
        results.errors.push({ message: `PostGIS state lookup: ${e.message}` });
      }
    }
    if (!geoId) {
      results.skippedFeatures += 1;
      continue;
    }

    const y = parseInt(String(n.date).slice(0, 4), 10);
    const m = parseInt(String(n.date).slice(5, 7), 10);
    const d = parseInt(String(n.date).slice(8, 10), 10);
    const avgT =
      n.avgTemperature != null
        ? n.avgTemperature
        : n.maxTemperature != null && n.minTemperature != null
          ? (n.maxTemperature + n.minTemperature) / 2
          : n.maxTemperature ?? n.minTemperature;

    try {
      const [row, created] = await ClimateData.findOrCreate({
        where: { geoDataId: geoId, date: n.date },
        defaults: {
          uf: null,
          year: y,
          month: m,
          day: d,
          avgTemperature: avgT,
          maxTemperature: n.maxTemperature,
          minTemperature: n.minTemperature,
          precipitation: n.precipitation,
          humidity: n.humidity,
          windSpeed: n.windSpeed,
          atmosphericPressure: n.atmosphericPressure,
          dataSource: 'inmet',
          weatherStation: n.stationName || 'INMET',
          stationCode: (n.stationCode || 'INMET').toString().slice(0, 20),
          dataQuality: 85,
          status: 'preliminar'
        },
        transaction
      });
      if (!created) {
        await row.update(
          {
            uf: row.uf || null,
            avgTemperature: avgT ?? row.avgTemperature,
            maxTemperature: n.maxTemperature ?? row.maxTemperature,
            minTemperature: n.minTemperature ?? row.minTemperature,
            precipitation: n.precipitation ?? row.precipitation,
            humidity: n.humidity ?? row.humidity,
            windSpeed: n.windSpeed ?? row.windSpeed,
            atmosphericPressure: n.atmosphericPressure ?? row.atmosphericPressure,
            dataSource: 'inmet',
            weatherStation: n.stationName || row.weatherStation,
            stationCode: (n.stationCode || row.stationCode).toString().slice(0, 20)
          },
          { transaction }
        );
      }
      results.upserted += 1;
    } catch (e) {
      results.errors.push({ message: e.message });
    }
  }

  return results;
}

/**
 * Sincronização sem transação única envolvendo HTTP externo.
 * Uma transação longa (CPTEC + Open-Meteo por UF) deixa a conexão idle-in-transaction
 * e provedores como Neon encerram o cliente — rollback falha com "not queryable".
 */
async function runClimateSync({ sequelize, models }) {
  const { ClimateData, GeoData, OfficialAlert } = models;
  try {
    const scope = (process.env.CLIMATE_SYNC_SCOPE || 'brasil').toLowerCase().trim();
    console.log(`[sync:climate] Escopo: ${scope}`);
    const cptecRes =
      scope === 'brasil'
        ? await syncCptecForStates({ ClimateData, GeoData, transaction: undefined })
        : await syncCptecForTocantinsMunicipalities({ ClimateData, GeoData, transaction: undefined });
    const openMeteoRes =
      scope === 'brasil'
        ? await syncOpenMeteoForStates({ sequelize, ClimateData, GeoData, transaction: undefined })
        : await syncOpenMeteoForTocantinsMunicipalities({ ClimateData, GeoData, transaction: undefined });
    const alertRes = await syncOfficialAlertsFromJson({ OfficialAlert, transaction: undefined });
    return { ok: true, cptec: cptecRes, openMeteo: openMeteoRes, officialAlerts: alertRes };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  runClimateSync,
  syncCptecForStates,
  syncCptecForTocantinsMunicipalities,
  syncOpenMeteoForStates,
  syncOpenMeteoForTocantinsMunicipalities,
  syncInmetFromConfiguredUrl,
  syncOfficialAlertsFromJson
};
