/**
 * Monta/atualiza registos na tabela `productivity` a partir de `ibge_sidra_1612`.
 * Chave única: (state, municipality_key, year, product_label).
 * Neste fluxo por UF, `municipality_name` guarda o nome do estado e
 * `municipality_key` usa o padrão `uf:XX`.
 *
 * Uso:
 *   node src/scripts/syncProductivityFromIbgeSidra1612.js
 *   node src/scripts/syncProductivityFromIbgeSidra1612.js --year=2023
 */
const path = require('path');
const { Op } = require('sequelize');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, models } = require('../config/database');
const { IbgeSidra1612Row, Productivity, GeoData } = models;
const { mapProductLabelToCropType } = require('../utils/sidra1612ProductCropMap');
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');

sequelize.options.logging = false;

const VAR_PLANTED = 'area plantada (hectares)';
/** Muitas linhas do CSV só trazem área colhida; usar como fallback da área (ha). */
const VAR_HARVESTED = 'area colhida (hectares)';
const VAR_QTY = 'quantidade produzida (toneladas)';
const VAR_YIELD_KG_HA = 'rendimento medio da producao (quilogramas por hectare)';

/** Preferir área plantada; se não houver ou for 0, usar área colhida (comum na tabela 1612). */
function plantedHectares(vars) {
  const pl = num(vars[VAR_PLANTED]);
  const col = num(vars[VAR_HARVESTED]);
  if (pl != null && pl > 0) return pl;
  if (col != null && col > 0) return col;
  if (pl != null) return pl;
  if (col != null) return col;
  return null;
}

function parseYearArg() {
  const hit = process.argv.find((a) => a.startsWith('--year='));
  if (!hit) return null;
  const y = parseInt(hit.split('=')[1], 10);
  return Number.isFinite(y) ? y : null;
}

function parsePeriodArg() {
  const hit = process.argv.find((a) => a.startsWith('--period='));
  if (!hit) return null;
  const p = String(hit.split('=')[1] || '').trim();
  return /^\d{4}-\d{2}$/.test(p) ? p : null;
}

async function ensureMonthlyUniqueConstraint() {
  // Remove constraint/index antigo (anual) que bloqueia múltiplos meses no mesmo ano.
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'productivity_state_munkey_year_product_uidx'
      ) THEN
        ALTER TABLE productivity DROP CONSTRAINT productivity_state_munkey_year_product_uidx;
      END IF;
    END $$;
  `);
  await sequelize.query(`
    DROP INDEX IF EXISTS productivity_state_munkey_year_product_uidx;
  `);
}

function seasonFromYear(y) {
  const next = y + 1;
  return `${y}/${String(next).slice(-2)}`;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Mapas de estados (nome/UF/código IBGE) → metadados em geo_data. */
async function loadGeoLookupStates() {
  const rows = await GeoData.findAll({
    where: { category: 'state', isActive: true },
    attributes: ['id', 'name', 'state', 'ibgeCode'],
    raw: true,
  });
  const byAnyKey = new Map();
  for (const r of rows) {
    const payload = {
      geoId: r.id,
      uf: String(r.state || '')
        .trim()
        .toUpperCase()
        .slice(0, 2),
      stateName: String(r.name || '').trim(),
      ibge2: String(r.ibgeCode || '').replace(/\D/g, '').slice(0, 2) || null,
    };
    if (!payload.uf || !payload.stateName) continue;
    const name = String(r.name || '').trim();
    if (name) byAnyKey.set(name.toLowerCase(), payload);
    if (name) byAnyKey.set(normalizeMunicipalityKey(name), payload);
    byAnyKey.set(payload.uf, payload);
    if (payload.ibge2) byAnyKey.set(payload.ibge2, payload);
  }
  return { byAnyKey };
}

function resolveStateContext(stateNameOrUf, lookup) {
  const raw = String(stateNameOrUf || '').trim();
  if (!raw) return null;
  const { byAnyKey } = lookup;
  return byAnyKey.get(raw.toUpperCase()) || byAnyKey.get(raw.toLowerCase()) || byAnyKey.get(normalizeMunicipalityKey(raw)) || null;
}

/** Agrupa linhas SIDRA por (estado, periodo, ano, produto) com mapa variável → valor. */
function groupByStateYearProduct(sidraRows, geoLookup) {
  const groups = new Map();
  for (const r of sidraRows) {
    const stateName = String(r.municipalityName || '').trim();
    const y = parseInt(String(r.year), 10);
    const periodRef = String(r.periodRef || '').trim();
    const prod = String(r.productLabel || '').trim();
    const vk = String(r.variableKey || '').trim();
    if (!stateName || !Number.isFinite(y) || y < 1970) continue;
    const crop = mapProductLabelToCropType(prod);
    if (!crop) continue;
    const stateCtx = resolveStateContext(stateName, geoLookup);
    if (!stateCtx || !stateCtx.uf) continue;

    const key = `${stateCtx.uf}|${periodRef || '-'}|${y}|${prod.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        state: stateCtx.uf,
        stateName: stateCtx.stateName,
        year: y,
        periodRef: periodRef || null,
        productLabel: prod,
        cropType: crop,
        geoId: stateCtx.geoId,
        vars: {},
      });
    }
    groups.get(key).vars[vk] = r.valueNumeric;
  }
  return groups;
}

function buildProductivityPayload(rep) {
  const planted = plantedHectares(rep.vars);
  const qty = num(rep.vars[VAR_QTY]);
  let yieldKgHa = num(rep.vars[VAR_YIELD_KG_HA]);
  let productivityTHa = yieldKgHa != null ? yieldKgHa / 1000 : null;
  const plantedArea = planted != null && planted >= 0 ? planted : 0;
  const totalProduction = qty != null && qty >= 0 ? qty : 0;
  if (productivityTHa == null && plantedArea > 0 && totalProduction > 0) {
    productivityTHa = totalProduction / plantedArea;
  }
  const productivity = productivityTHa != null && productivityTHa >= 0 ? productivityTHa : 0;
  const label = String(rep.productLabel || '').trim() || rep.cropType;
  const stateName = String(rep.stateName || '').trim() || rep.state;
  const mKey = `uf:${rep.state}`;

  const roundedPa = Math.round(plantedArea * 100) / 100;
  const roundedQty = Math.round(totalProduction * 100) / 100;
  const roundedProd = Math.round(productivity * 10000) / 10000;
  const allZero = roundedPa === 0 && roundedQty === 0 && roundedProd === 0;

  const baseObs = `SIDRA 1612 · ${rep.productLabel}`;
  const zeroExplanation =
    ' IBGE/SIDRA: sem área plantada ou colhida e sem produção reportada nesta UF e neste ano (valores 0).';

  return {
    geoDataId: rep.geoId || null,
    state: rep.state,
    municipalityName: stateName,
    municipalityKey: mKey,
    municipalityIbgeCode: null,
    year: rep.year,
    season: rep.periodRef || seasonFromYear(rep.year),
    periodRef: rep.periodRef || null,
    cropType: rep.cropType,
    productLabel: label,
    productivity: roundedProd,
    plantedArea: roundedPa,
    totalProduction: roundedQty,
    dataSource: 'ibge',
    dataReliability: 95,
    status: 'confirmado',
    technologyLevel: 'media',
    irrigationUsed: false,
    observations: allZero ? `${baseObs}.${zeroExplanation}` : baseObs,
  };
}

async function main() {
  const filterYear = parseYearArg();
  const filterPeriod = parsePeriodArg();

  await sequelize.authenticate();
  await Productivity.sync({ alter: true });
  await IbgeSidra1612Row.sync({ alter: true });
  await ensureMonthlyUniqueConstraint();

  const geoLookup = await loadGeoLookupStates();

  const where = { year: { [Op.gt]: 0 } };
  if (filterYear != null) Object.assign(where, { year: filterYear });
  if (filterPeriod != null) Object.assign(where, { periodRef: filterPeriod });

  const sidraRows = await IbgeSidra1612Row.findAll({
    where,
    raw: true,
    attributes: ['year', 'periodRef', 'municipalityName', 'productLabel', 'variableKey', 'valueNumeric'],
  });

  const productGroups = groupByStateYearProduct(sidraRows, geoLookup);

  const payloads = [];
  let withZeroIndicators = 0;

  for (const rep of productGroups.values()) {
    const p = buildProductivityPayload(rep);
    if (p.plantedArea === 0 && p.totalProduction === 0 && p.productivity === 0) {
      withZeroIndicators += 1;
    }
    payloads.push(p);
  }

  const CHUNK = 400;
  let upserted = 0;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const chunk = payloads.slice(i, i + CHUNK);
    await Productivity.bulkCreate(chunk, {
      validate: true,
      hooks: false,
      conflictAttributes: ['state', 'municipalityKey', 'year', 'periodRef', 'productLabel'],
      updateOnDuplicate: [
        'geoDataId',
        'municipalityName',
        'municipalityIbgeCode',
        'cropType',
        'productivity',
        'plantedArea',
        'totalProduction',
        'season',
        'periodRef',
        'observations',
        'dataReliability',
        'status',
        'technologyLevel',
        'updatedAt',
      ],
    });
    upserted += chunk.length;
  }

  console.log('✅ productivity ← ibge_sidra_1612 (upsert por UF+periodo+produto).');
  console.log(`   Produtos SIDRA agrupados: ${productGroups.size}`);
  console.log(`   Registos finais (UF×periodo×produto): ${productGroups.size}`);
  console.log(`   Gravados/atualizados: ${upserted}`);
  console.log(
    `   Com 0 ha / 0 t / 0 t/ha (nota explicativa em observations): ${withZeroIndicators}`
  );
  if (filterYear != null) console.log(`   Filtro ano: ${filterYear}`);
  if (filterPeriod != null) console.log(`   Filtro periodo: ${filterPeriod}`);

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Erro:', e);
  process.exit(1);
});
