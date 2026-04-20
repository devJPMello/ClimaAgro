/**
 * Atualiza `geom` (Point WGS84) dos municípios TO em `geo_data` com sedes aproximadas
 * via API de geocodificação Open-Meteo (sem chave). Substitui o placeholder do
 * `ensureTocantinsMunicipiosGeoData` para o sync Open-Meteo refletir clima local.
 *
 *   node src/scripts/geocodeTocantinsMunicipiosGeoData.js
 *
 * Variável opcional: GEOCODE_DELAY_MS (pausa entre pedidos, default 350).
 */
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, models } = require('../config/database');
const { GeoData } = models;

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Prefere resultado cujo estado (admin1) seja Tocantins. */
function pickTocantinsHit(results) {
  if (!Array.isArray(results) || !results.length) return null;
  const to = results.find((r) => String(r.admin1 || '').toLowerCase() === 'tocantins');
  return to || results[0];
}

async function geocodeNomeMunicipio(nome) {
  const { data } = await axios.get(GEOCODE_URL, {
    params: {
      name: `${nome}, Brasil`,
      count: 10,
      language: 'pt',
      country: 'BR'
    },
    timeout: 25000,
    headers: { 'User-Agent': process.env.UPSTREAM_USER_AGENT || 'ClimaAgro/1.0' },
    validateStatus: (s) => s === 200
  });
  const hit = pickTocantinsHit(data?.results);
  if (!hit || hit.latitude == null || hit.longitude == null) return null;
  return { lat: Number(hit.latitude), lon: Number(hit.longitude) };
}

async function main() {
  await sequelize.authenticate();
  const rows = await GeoData.findAll({
    where: { state: 'TO', category: 'municipality', isActive: true },
    order: [['name', 'ASC']]
  });

  const delay = Number(process.env.GEOCODE_DELAY_MS || 350);
  let ok = 0;
  let skip = 0;
  const errors = [];

  for (const g of rows) {
    const nome = String(g.name || '').trim();
    if (!nome) {
      skip += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const coords = await geocodeNomeMunicipio(nome);
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) {
        errors.push({ nome, message: 'Sem resultado na geocodificação' });
        skip += 1;
      } else {
        const props = { ...(g.properties && typeof g.properties === 'object' ? g.properties : {}), geocodedOpenMeteo: true };
        // eslint-disable-next-line no-await-in-loop
        await g.update({
          geom: { type: 'Point', coordinates: [coords.lon, coords.lat] },
          properties: props
        });
        ok += 1;
      }
    } catch (e) {
      errors.push({ nome, message: e.message || String(e) });
      skip += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(delay);
  }

  console.log(`✅ geocodeTocantinsMunicipiosGeoData: ${rows.length} municípios; atualizados: ${ok}; ignorados/erro: ${skip}`);
  if (errors.length) {
    console.log('Primeiros erros:', errors.slice(0, 8));
  }
  console.log('   Rode em seguida: npm run sync:climate');

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ geocodeTocantinsMunicipiosGeoData:', e.message || e);
  process.exit(1);
});
