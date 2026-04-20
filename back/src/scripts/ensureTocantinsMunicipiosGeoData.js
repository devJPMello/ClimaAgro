/**
 * Garante um registo `geo_data` por município do Tocantins (malha IBGE / API localidades),
 * para o sync SIDRA conseguir ligar produtividade a `geo_data_id` e ao `ibge_code` do mapa.
 *
 * O seed demo só traz ~6 municípios TO; sem este passo, milhares de grupos SIDRA ficam sem geo.
 *
 * Uso:
 *   node src/scripts/ensureTocantinsMunicipiosGeoData.js
 *   npm run geo:geocode-tocantins   # sedes via Open-Meteo (recomendado antes do sync de clima)
 *   npm run sync:climate
 *
 * Requer rede (GET API IBGE). Geometria inicial: ponto placeholder no retângulo de TO;
 * o clima por município Open-Meteo usa lat/lon — `geo:geocode-tocantins` atualiza para sedes reais.
 */
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, models } = require('../config/database');
const { GeoData } = models;

const UF_TO = '17';
const IBGE_MUNICIPIOS_URL = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_TO}/municipios`;

/** Distribui pontos de forma determinística dentro de TO (~lon -50..-45, lat -13..-5). */
function placeholderGeomFromIbge7(code7) {
  const digits = String(code7).replace(/\D/g, '').padStart(7, '0').slice(-7);
  let h = 0;
  for (let i = 0; i < digits.length; i += 1) {
    h = (h * 31 + digits.charCodeAt(i)) >>> 0;
  }
  const t = (h % 10000) / 10000;
  const u = ((h >> 3) % 10000) / 10000;
  const lon = -50.2 + t * 4.8;
  const lat = -12.8 + u * 7.5;
  return { type: 'Point', coordinates: [lon, lat] };
}

async function fetchMunicipiosTocantins() {
  const { data } = await axios.get(IBGE_MUNICIPIOS_URL, {
    timeout: 60000,
    headers: { Accept: 'application/json' },
    validateStatus: (s) => s === 200,
  });
  if (!Array.isArray(data)) {
    throw new Error('Resposta IBGE inesperada (esperado array de municípios).');
  }
  return data.map((m) => ({
    ibgeCode: String(m.id),
    nome: String(m.nome || '').trim(),
  }));
}

async function main() {
  await sequelize.authenticate();

  const municipios = await fetchMunicipiosTocantins();
  let created = 0;
  let already = 0;

  for (const m of municipios) {
    if (!m.nome || m.ibgeCode.length < 7) continue;

    const existing = await GeoData.findOne({
      where: {
        state: 'TO',
        category: 'municipality',
        ibgeCode: m.ibgeCode,
      },
    });

    if (existing) {
      already += 1;
      continue;
    }

    await GeoData.create({
      layerName: 'municipios_tocantins',
      geometryType: 'Point',
      category: 'municipality',
      name: m.nome,
      state: 'TO',
      region: 'Norte',
      adminLevel: 3,
      ibgeCode: m.ibgeCode,
      isActive: true,
      properties: {
        codigo: m.ibgeCode,
        nome: m.nome,
        uf: 'TO',
        fonte: 'ibge_localidades_api',
      },
      geom: placeholderGeomFromIbge7(m.ibgeCode),
    });
    created += 1;
  }

  console.log(`✅ ensureTocantinsMunicipiosGeoData: ${municipios.length} municípios na API IBGE.`);
  console.log(`   Já existentes (ibge_code): ${already}`);
  console.log(`   Criados agora: ${created}`);
  console.log('   Rode em seguida: npm run sync:productivity-ibge');

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ ensureTocantinsMunicipiosGeoData:', e.message || e);
  process.exit(1);
});
