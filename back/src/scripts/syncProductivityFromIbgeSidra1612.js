/**
 * Monta/atualiza registos na tabela `productivity` a partir de `ibge_sidra_1612`.
 * Chave única: (state, municipality_key, year, product_label) — não exige geo_data;
 * geo_data_id é preenchido quando existir município correspondente em geo_data.
 *
 * Uso:
 *   node src/scripts/syncProductivityFromIbgeSidra1612.js
 *   node src/scripts/syncProductivityFromIbgeSidra1612.js --year=2023
 */
const path = require('path');
const { Op } = require('sequelize');
const axios = require('axios');

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

function seasonFromYear(y) {
  const next = y + 1;
  return `${y}/${String(next).slice(-2)}`;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Mapas: chave por nome (minúsculas e sem acento) → geo_data.id; código IBGE 7 dígitos → id. */
async function loadGeoLookupTocantins() {
  const rows = await GeoData.findAll({
    where: { state: 'TO', category: 'municipality', isActive: true },
    attributes: ['id', 'name', 'ibgeCode'],
    raw: true,
  });
  const byKey = new Map();
  const byIbge = new Map();
  for (const r of rows) {
    const id = r.id;
    const name = String(r.name || '').trim();
    if (name) {
      byKey.set(name.toLowerCase(), id);
      byKey.set(normalizeMunicipalityKey(name), id);
    }
    const code = String(r.ibgeCode || '').replace(/\D/g, '');
    if (code.length >= 7) {
      byIbge.set(code.slice(0, 7), id);
    }
  }
  return { byKey, byIbge };
}

/** Nome oficial IBGE (normalizado) → código 7 dígitos — cobre casos em que o texto SIDRA não coincide com `geo_data.name`. */
async function loadIbgeNomeToCodigoTocantins() {
  const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/17/municipios';
  const { data } = await axios.get(url, {
    timeout: 60000,
    headers: { Accept: 'application/json' },
    validateStatus: (s) => s === 200,
  });
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const m of data) {
    const nome = String(m.nome || '').trim();
    const id = String(m.id || '');
    if (!nome || id.length < 7) continue;
    map.set(normalizeMunicipalityKey(nome), id.slice(0, 7));
  }
  return map;
}

function resolveGeoDataId(municipalityName, lookup, nomeToIbge) {
  const raw = String(municipalityName || '').trim();
  if (!raw) return null;
  const { byKey, byIbge } = lookup;
  let id = byKey.get(raw.toLowerCase()) || byKey.get(normalizeMunicipalityKey(raw));
  if (id) return id;
  const cod = nomeToIbge.get(normalizeMunicipalityKey(raw));
  if (cod) id = byIbge.get(cod);
  return id || null;
}

/** Agrupa linhas SIDRA por (município, ano, produto) com mapa variável → valor. */
function groupByMunicipalityYearProduct(sidraRows) {
  const groups = new Map();
  for (const r of sidraRows) {
    const mun = String(r.municipalityName || '').trim();
    const y = parseInt(String(r.year), 10);
    const prod = String(r.productLabel || '').trim();
    const vk = String(r.variableKey || '').trim();
    if (!mun || !Number.isFinite(y) || y < 1970) continue;
    if (mun.toLowerCase() === 'tocantins') continue;
    const crop = mapProductLabelToCropType(prod);
    if (!crop) continue;

    const key = `${mun.toLowerCase()}|${y}|${prod.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { municipalityName: mun, year: y, productLabel: prod, cropType: crop, vars: {} });
    }
    groups.get(key).vars[vk] = r.valueNumeric;
  }
  return groups;
}

function buildProductivityPayload(rep, ctx) {
  const { geoId, ibge7 } = ctx;
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
  const munName = String(rep.municipalityName || '').trim() || '—';
  const mKey = normalizeMunicipalityKey(munName) || 'unknown';

  const roundedPa = Math.round(plantedArea * 100) / 100;
  const roundedQty = Math.round(totalProduction * 100) / 100;
  const roundedProd = Math.round(productivity * 10000) / 10000;
  const allZero = roundedPa === 0 && roundedQty === 0 && roundedProd === 0;

  const baseObs = `SIDRA 1612 · ${rep.productLabel}`;
  const zeroExplanation =
    ' IBGE/SIDRA: sem área plantada ou colhida e sem produção reportada neste município e neste ano (valores 0). ' +
    'Isto não significa que a cultura não seja cultivada noutros municípios do Tocantins — apenas que, neste município, não há registo de cultivo desta cultura para o ano.';

  return {
    geoDataId: geoId || null,
    state: 'TO',
    municipalityName: munName,
    municipalityKey: mKey,
    municipalityIbgeCode: ibge7 && ibge7.length === 7 ? ibge7 : null,
    year: rep.year,
    season: seasonFromYear(rep.year),
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

  await sequelize.authenticate();
  await Productivity.sync({ alter: false });
  await IbgeSidra1612Row.sync({ alter: false });

  const geoLookup = await loadGeoLookupTocantins();
  let nomeToIbge = new Map();
  try {
    nomeToIbge = await loadIbgeNomeToCodigoTocantins();
  } catch (e) {
    console.warn('⚠️  API IBGE (nomes municípios) indisponível — só matching por geo_data local:', e.message || e);
  }

  const where = { year: { [Op.gt]: 0 } };
  if (filterYear != null) Object.assign(where, { year: filterYear });

  const sidraRows = await IbgeSidra1612Row.findAll({
    where,
    raw: true,
    attributes: ['year', 'municipalityName', 'productLabel', 'variableKey', 'valueNumeric'],
  });

  const productGroups = groupByMunicipalityYearProduct(sidraRows);

  const payloads = [];
  let withZeroIndicators = 0;

  for (const rep of productGroups.values()) {
    const geoId = resolveGeoDataId(rep.municipalityName, geoLookup, nomeToIbge);
    const ibge7 = nomeToIbge.get(normalizeMunicipalityKey(rep.municipalityName)) || null;
    const p = buildProductivityPayload(rep, { geoId, ibge7 });
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
      conflictAttributes: ['state', 'municipalityKey', 'year', 'productLabel'],
      updateOnDuplicate: [
        'geoDataId',
        'municipalityName',
        'municipalityIbgeCode',
        'cropType',
        'productivity',
        'plantedArea',
        'totalProduction',
        'season',
        'observations',
        'dataReliability',
        'status',
        'technologyLevel',
        'updatedAt',
      ],
    });
    upserted += chunk.length;
  }

  console.log('✅ productivity ← ibge_sidra_1612 (upsert por state+municipality_key+year+product_label).');
  console.log(`   Produtos SIDRA agrupados: ${productGroups.size}`);
  console.log(`   Registos finais (município×ano×produto): ${productGroups.size}`);
  console.log(`   Gravados/atualizados: ${upserted}`);
  console.log(
    `   Com 0 ha / 0 t / 0 t/ha (nota explicativa em observations): ${withZeroIndicators}`
  );
  if (filterYear != null) console.log(`   Filtro ano: ${filterYear}`);

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Erro:', e);
  process.exit(1);
});
