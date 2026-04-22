/**
 * Importa o CSV longo gerado pelo ETL (tabela 1612 SIDRA) para a tabela `ibge_sidra_1612`.
 *
 * Uso:
 *   node src/scripts/importIbgeSidra1612Csv.js
 *   node src/scripts/importIbgeSidra1612Csv.js --replace
 *
 * Variáveis de ambiente (opcional):
 *   IBGE_SIDRA1612_CSV_PATH — caminho absoluto ou relativo ao diretório `back/` (padrão: ../ETL/out/ibge_tabela1612_long.csv)
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, models } = require('../config/database');
const { IbgeSidra1612Row, GeoData } = models;
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');

sequelize.options.logging = false;

const DEFAULT_CSV = path.join(__dirname, '../../../ETL/out/ibge_tabela1612_long.csv');
const CHUNK = 2000;

function parseArgs() {
  return { replace: process.argv.includes('--replace') };
}

function resolveCsvPath() {
  const fromEnv = (process.env.IBGE_SIDRA1612_CSV_PATH || '').trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(__dirname, '../..', fromEnv);
  }
  return DEFAULT_CSV;
}

function parseDataLine(line) {
  const s = line.replace(/\r$/, '').trim();
  if (!s) return null;
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '"') {
      const next = s[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  if (parts.length !== 6) return null;
  return parts.map((p) => String(p).trim());
}

function parseYear(raw) {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseValor(raw) {
  const t = String(raw ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parsePeriod(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  return /^\d{4}-\d{2}$/.test(t) ? t : null;
}

async function loadGeoDataIdByStateName() {
  const rows = await GeoData.findAll({
    where: { category: 'state', isActive: true },
    attributes: ['id', 'name', 'state', 'ibgeCode'],
  });
  const map = new Map();
  for (const r of rows) {
    const keys = new Set();
    const name = String(r.name || '').trim();
    const uf = String(r.state || '').trim().toUpperCase();
    const ibgeCode = String(r.ibgeCode || '').replace(/\D/g, '').slice(0, 2);
    if (name) {
      keys.add(name.toLowerCase());
      keys.add(normalizeMunicipalityKey(name));
    }
    if (uf) keys.add(uf);
    if (ibgeCode) keys.add(ibgeCode);
    for (const key of keys) {
      if (key) map.set(key, r.id);
    }
  }
  return map;
}

async function main() {
  const { replace } = parseArgs();
  const csvPath = resolveCsvPath();

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV não encontrado: ${csvPath}`);
    process.exit(1);
  }

  await sequelize.authenticate();
  await IbgeSidra1612Row.sync({ alter: true });

  if (replace) {
    await IbgeSidra1612Row.destroy({ where: {}, truncate: true });
    console.log('🗑️  Tabela ibge_sidra_1612 truncada (--replace).');
  }

  const geoByName = await loadGeoDataIdByStateName();
  const raw = fs.readFileSync(csvPath, { encoding: 'utf8' });
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const header = lines[0].trim().toLowerCase();
  if (!header.startsWith('ano,')) {
    console.warn('⚠️  Cabeçalho inesperado (esperado coluna Ano,...):', lines[0]);
  }

  const dataLines = lines.slice(1);
  let inserted = 0;
  let skipped = 0;
  let batch = [];

  for (let i = 0; i < dataLines.length; i += 1) {
    const parts = parseDataLine(dataLines[i]);
    if (!parts) {
      skipped += 1;
      continue;
    }
    const year = parseYear(parts[0]);
    if (year == null) {
      skipped += 1;
      continue;
    }
    const periodRef = parsePeriod(parts[1]);
    const municipalityName = parts[2].trim();
    const productLabel = parts[3].trim();
    const variableKey = parts[4].trim();
    const valueNumeric = parseValor(parts[5]);

    const geoDataId =
      geoByName.get(municipalityName.toLowerCase()) ||
      geoByName.get(normalizeMunicipalityKey(municipalityName)) ||
      null;

    batch.push({
      year,
      periodRef,
      municipalityName,
      productLabel,
      variableKey,
      valueNumeric,
      geoDataId,
    });

    if (batch.length >= CHUNK) {
      await IbgeSidra1612Row.bulkCreate(batch, {
        validate: false,
        hooks: false,
        ignoreDuplicates: true,
      });
      inserted += batch.length;
      batch = [];
      if (inserted % (CHUNK * 5) === 0) {
        console.log(`… ${inserted} linhas processadas`);
      }
    }
  }

  if (batch.length) {
    await IbgeSidra1612Row.bulkCreate(batch, {
      validate: false,
      hooks: false,
      ignoreDuplicates: true,
    });
    inserted += batch.length;
  }

  const total = await IbgeSidra1612Row.count();
  console.log(`✅ Importação concluída. Inseridas nesta execução (aprox.): ${inserted}. Ignoradas/malformadas: ${skipped}.`);
  console.log(`📊 Total de linhas na tabela ibge_sidra_1612: ${total}`);

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Erro na importação:', e);
  process.exit(1);
});
