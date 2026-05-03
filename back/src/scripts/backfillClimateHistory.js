/**
 * Popula histórico climático 2024-hoje para todos os estados ativos via Open-Meteo Archive API.
 * Roda uma única vez (ou sempre que necessário): npm run backfill:climate
 *
 * Variáveis de ambiente opcionais:
 *   BACKFILL_START_DATE  — padrão: 2024-01-01
 *   BACKFILL_END_DATE    — padrão: ontem (America/Sao_Paulo)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { connectDB, sequelize, models } = require('../config/database');
const openMeteo = require('../services/openMeteoClient');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function mergeMetadata(prev, patch) {
  return { ...(prev && typeof prev === 'object' ? prev : {}), ...patch };
}

async function run() {
  const { ClimateData, GeoData } = models;

  const startDate = process.env.BACKFILL_START_DATE || '2024-01-01';
  const endDate   = process.env.BACKFILL_END_DATE   || yesterday();

  console.log(`\n📅 Backfill histórico: ${startDate} → ${endDate}\n`);

  const states = await GeoData.findAll({
    where: { category: 'state', isActive: true },
    attributes: ['id', 'state', 'name'],
    order: [['state', 'ASC']],
  });

  console.log(`🗺️  ${states.length} estado(s) encontrado(s).\n`);

  let totalUpserted = 0;
  let totalSkipped  = 0;
  const errors = [];

  for (const g of states) {
    const uf = String(g.state || '').toUpperCase().slice(0, 2);
    if (!uf) continue;

    // Calcular centroide via PostGIS
    let lat = null;
    let lon = null;
    try {
      const [rows] = await sequelize.query(
        `SELECT
           ST_Y(ST_Centroid(geom::geometry))::float AS lat,
           ST_X(ST_Centroid(geom::geometry))::float AS lon
         FROM geo_data WHERE id = :id LIMIT 1`,
        { replacements: { id: g.id } }
      );
      lat = Number(rows?.[0]?.lat);
      lon = Number(rows?.[0]?.lon);
    } catch (e) {
      errors.push({ uf, phase: 'centroid', msg: e.message });
      console.warn(`  ⚠️  ${uf}: falha ao calcular centroide — pulando.`);
      continue;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      errors.push({ uf, phase: 'centroid', msg: 'coordenadas inválidas' });
      console.warn(`  ⚠️  ${uf}: coordenadas inválidas — pulando.`);
      continue;
    }

    console.log(`  🌡️  ${uf} (${g.name}) lat=${lat.toFixed(2)} lon=${lon.toFixed(2)}`);

    try {
      const payload = await openMeteo.fetchHistoricalDailyByCoords({ lat, lon, startDate, endDate });
      const rows = openMeteo.dailyToRows(payload);

      if (!rows.length) {
        console.warn(`  ⚠️  ${uf}: arquivo retornou 0 registros.`);
        errors.push({ uf, phase: 'archive', msg: 'sem dados' });
        await sleep(300);
        continue;
      }

      let ufUpserted = 0;
      let ufSkipped  = 0;

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
            source: 'archive',
            timezone: payload.timezone || 'America/Sao_Paulo',
          },
        };

        const [row, created] = await ClimateData.findOrCreate({
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
            weatherStation: `Open-Meteo Archive ${uf}`,
            stationCode: `OPENMETEO-ARCHIVE:${uf}`,
            dataQuality: 90,
            status: 'historico',
            metadata: md,
          },
        });

        if (created) {
          ufUpserted += 1;
        } else {
          // Preenche campos que ainda estão nulos (não sobrescreve dados de qualidade superior)
          const patch = {};
          if (row.avgTemperature == null && avgT != null) patch.avgTemperature = avgT;
          if (row.maxTemperature == null && r.maxTemperature != null) patch.maxTemperature = r.maxTemperature;
          if (row.minTemperature == null && r.minTemperature != null) patch.minTemperature = r.minTemperature;
          if (row.precipitation  == null && r.precipitation  != null) patch.precipitation  = r.precipitation;
          if (row.humidity       == null && r.humidity       != null) patch.humidity       = r.humidity;
          if (row.windSpeed      == null && r.windSpeed      != null) patch.windSpeed      = r.windSpeed;
          if (row.atmosphericPressure == null && r.atmosphericPressure != null) patch.atmosphericPressure = r.atmosphericPressure;

          if (Object.keys(patch).length > 0) {
            patch.metadata = mergeMetadata(row.metadata, md);
            await row.update(patch);
            ufUpserted += 1;
          } else {
            ufSkipped += 1;
          }
        }
      }

      totalUpserted += ufUpserted;
      totalSkipped  += ufSkipped;
      console.log(`      ✅ ${rows.length} datas | inseridos/atualizados: ${ufUpserted} | já completos: ${ufSkipped}`);
    } catch (e) {
      errors.push({ uf, phase: 'archive', msg: e.message || String(e) });
      console.error(`  ❌  ${uf}: ${e.message || e}`);
    }

    // Respeitar rate-limit da Open-Meteo Archive (~10 req/s free tier)
    await sleep(Number(process.env.OPEN_METEO_SYNC_DELAY_MS || 300));
  }

  console.log(`\n✅ Backfill concluído.`);
  console.log(`   Inseridos/atualizados : ${totalUpserted}`);
  console.log(`   Já completos (pulados): ${totalSkipped}`);
  if (errors.length) {
    console.warn(`   Erros (${errors.length}):`, JSON.stringify(errors, null, 2));
  }
}

(async () => {
  try {
    await connectDB();
    await run();
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Erro fatal:', e.message || e);
    await sequelize.close().catch(() => {});
    process.exit(1);
  }
})();
