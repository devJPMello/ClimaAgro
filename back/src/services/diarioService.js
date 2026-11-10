const crypto = require('crypto');
const { sequelize } = require('../config/database');

/** Tipos de registro aceitos no Diário de Campo. */
const TIPOS = ['plantio', 'adubacao', 'aplicacao', 'praga_doenca', 'colheita', 'observacao'];
const MAX_REGISTROS_POR_USUARIO = 500;
const JANELA_DIAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

function hojeIso(agora = new Date()) {
  return agora.toISOString().slice(0, 10);
}

function somaDias(iso, dias) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function limpa(texto, max) {
  return String(texto ?? '').trim().slice(0, max);
}

/**
 * Valida e normaliza os campos de um registro.
 * @returns {{ erro: string } | { valor: object }}
 */
function validarEntrada(body, agora = new Date()) {
  const data = limpa(body?.data, 10);
  if (!dataValida(data)) return { erro: 'Informe a data do registro (AAAA-MM-DD).' };
  if (data > somaDias(hojeIso(agora), 1)) return { erro: 'A data do registro não pode estar no futuro.' };

  const tipo = limpa(body?.tipo, 20);
  if (!TIPOS.includes(tipo)) return { erro: 'Tipo de registro inválido.' };

  const uf = limpa(body?.uf, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) return { erro: 'Informe a UF do registro.' };

  const observacao = limpa(body?.observacao, 2000);
  return {
    valor: {
      data,
      tipo,
      cultura: limpa(body?.cultura, 60) || null,
      uf,
      municipio: limpa(body?.municipio, 80) || null,
      observacao: observacao || null,
    },
  };
}

function paraApi(row) {
  const anexos = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id,
    data: row.data,
    tipo: row.tipo,
    cultura: row.cultura,
    uf: row.uf,
    municipio: row.municipio,
    observacao: row.observacao,
    anexos: anexos.map((a) => ({ nome: a.name, tipo: a.mime })),
    criadoEm: row.created_at,
  };
}

const COLUNAS =
  'id, entry_date::text AS data, entry_type AS tipo, crop AS cultura, uf, municipality AS municipio, notes AS observacao, attachments, created_at';

async function listar(userId, limite = 200) {
  const [rows] = await sequelize.query(
    `SELECT ${COLUNAS} FROM field_diary_entries WHERE user_id = :userId ORDER BY entry_date DESC, created_at DESC LIMIT :limite`,
    { replacements: { userId, limite: Math.min(Math.max(Number(limite) || 200, 1), 500) } }
  );
  return rows.map(paraApi);
}

async function buscarBruto(userId, id) {
  const [rows] = await sequelize.query(
    `SELECT ${COLUNAS} FROM field_diary_entries WHERE user_id = :userId AND id = :id LIMIT 1`,
    { replacements: { userId, id } }
  );
  return rows[0] || null;
}

async function contar(userId) {
  const [rows] = await sequelize.query('SELECT COUNT(*)::int AS n FROM field_diary_entries WHERE user_id = :userId', {
    replacements: { userId },
  });
  return rows[0]?.n ?? 0;
}

async function criar(userId, valor, anexos) {
  const id = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO field_diary_entries (id, user_id, entry_date, entry_type, crop, uf, municipality, notes, attachments)
     VALUES (:id, :userId, :data, :tipo, :cultura, :uf, :municipio, :observacao, CAST(:anexos AS jsonb))`,
    { replacements: { id, userId, ...valor, anexos: JSON.stringify(anexos || []) } }
  );
  return id;
}

/** Apaga o registro e devolve os anexos, para o chamador remover os arquivos. */
async function remover(userId, id) {
  const [rows] = await sequelize.query(
    'DELETE FROM field_diary_entries WHERE user_id = :userId AND id = :id RETURNING attachments',
    { replacements: { userId, id } }
  );
  if (!rows.length) return null;
  return Array.isArray(rows[0].attachments) ? rows[0].attachments : [];
}

/** Apaga todos os registros do usuário (exclusão de conta) e devolve as chaves dos anexos. */
async function removerTodos(userId) {
  const [rows] = await sequelize.query('DELETE FROM field_diary_entries WHERE user_id = :userId RETURNING attachments', {
    replacements: { userId },
  });
  return rows.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : []).map((a) => a.key)).filter(Boolean);
}

async function resumoClima(uf, inicio, fim) {
  if (inicio > fim) return null;
  const [rows] = await sequelize.query(
    `SELECT AVG(c.avg_temperature) AS temp,
            SUM(c.precipitation) AS chuva,
            COUNT(*) FILTER (WHERE c.precipitation >= 1) AS dias_chuva,
            COUNT(DISTINCT c.date) AS dias
       FROM climate_data c
       JOIN geo_data g ON g.id = c.geo_data_id
      WHERE g.category = 'state' AND g.state = :uf AND c.date BETWEEN :inicio AND :fim`,
    { replacements: { uf, inicio, fim } }
  );
  const r = rows[0];
  const dias = Number(r?.dias || 0);
  if (!dias) return { dias: 0, chuvaMm: null, tempMedia: null, diasComChuva: null };
  const arred = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);
  return { dias, chuvaMm: arred(r.chuva), tempMedia: arred(r.temp), diasComChuva: Number(r.dias_chuva || 0) };
}

/**
 * Clima do estado na semana anterior e na semana posterior à data do registro
 * (a semana posterior só vai até hoje; `null` se ainda não começou).
 */
async function contextoClimatico(uf, data, agora = new Date()) {
  const hoje = hojeIso(agora);
  const antes = await resumoClima(uf, somaDias(data, -JANELA_DIAS), somaDias(data, -1));
  const fimDepois = somaDias(data, JANELA_DIAS) > hoje ? hoje : somaDias(data, JANELA_DIAS);
  const depois = await resumoClima(uf, somaDias(data, 1), fimDepois);
  return { janelaDias: JANELA_DIAS, antes, depois };
}

const ROTULO_TIPO = {
  plantio: 'Plantio',
  adubacao: 'Adubação',
  aplicacao: 'Aplicação',
  praga_doenca: 'Praga ou doença observada',
  colheita: 'Colheita',
  observacao: 'Observação geral',
};

function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function descreveClima(r) {
  if (!r || !r.dias) return 'sem dados de clima';
  const partes = [];
  if (r.chuvaMm != null) {
    partes.push(`${String(r.chuvaMm).replace('.', ',')} mm de chuva${r.diasComChuva != null ? ` em ${r.diasComChuva} dia(s)` : ''}`);
  }
  if (r.tempMedia != null) partes.push(`temperatura média de ${String(r.tempMedia).replace('.', ',')} °C`);
  return partes.length ? partes.join(', ') : 'sem dados de clima';
}

/** Texto do registro (e do clima do período, se houver) para enviar ao WhatsApp do próprio usuário. */
function montarMensagemWhatsapp(registro, clima) {
  const local = [registro.cultura, registro.municipio, registro.uf].filter(Boolean).join(' · ');
  const linhas = ['📓 ClimaAgro — Diário de Campo', '', `*${ROTULO_TIPO[registro.tipo] || registro.tipo}* — ${dataBr(registro.data)}`];
  if (local) linhas.push(local);
  if (registro.observacao) linhas.push('', registro.observacao);
  if (clima) {
    linhas.push('', `Clima do estado (${registro.uf}):`);
    linhas.push(`• ${clima.janelaDias} dias antes: ${descreveClima(clima.antes)}`);
    linhas.push(`• ${clima.janelaDias} dias depois: ${clima.depois ? descreveClima(clima.depois) : 'ainda sem dados'}`);
  }
  return linhas.join(String.fromCharCode(10));
}

module.exports = {
  montarMensagemWhatsapp,
  TIPOS,
  MAX_REGISTROS_POR_USUARIO,
  validarEntrada,
  listar,
  buscarBruto,
  contar,
  criar,
  remover,
  removerTodos,
  contextoClimatico,
  _internos: { somaDias, dataValida },
};
