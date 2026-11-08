const crypto = require('crypto');

/**
 * Confirmação de número de WhatsApp por código de 6 dígitos.
 *
 * Os códigos ficam no Postgres (tabela whatsapp_verificacoes): no Render gratuito o
 * servidor dorme/reinicia e um código guardado só em memória se perderia no meio do
 * cadastro. Nos testes automáticos usa-se memória.
 */

const VALIDADE_CODIGO_MS = 10 * 60 * 1000;
const VALIDADE_CONFIRMACAO_MS = 30 * 60 * 1000;
const INTERVALO_REENVIO_MS = 60 * 1000;
const MAX_TENTATIVAS = 5;

// ── Armazenamento ──────────────────────────────────────────────────────────
// Cada usuário tem até dois registros: 'pendente' { numero, hash, expiraEm, tentativas, enviadoEm }
// e 'confirmado' { numero, expiraEm }.

function criarMemoria() {
  const dados = new Map();
  const k = (userId, tipo) => `${userId}|${tipo}`;
  return {
    async get(userId, tipo) {
      return dados.get(k(userId, tipo)) || null;
    },
    async set(userId, tipo, valor) {
      dados.set(k(userId, tipo), { ...valor });
    },
    async del(userId, tipo) {
      dados.delete(k(userId, tipo));
    },
    async limpar() {
      dados.clear();
    },
  };
}

function criarBanco() {
  const db = () => require('../config/database').sequelize; // require tardio (evita ciclo)
  return {
    async get(userId, tipo) {
      const [rows] = await db().query(
        'SELECT dados FROM whatsapp_verificacoes WHERE user_id = :userId AND tipo = :tipo LIMIT 1',
        { replacements: { userId, tipo } }
      );
      return rows.length ? rows[0].dados : null;
    },
    async set(userId, tipo, valor) {
      await db().query(
        `INSERT INTO whatsapp_verificacoes (user_id, tipo, dados, expira_em)
         VALUES (:userId, :tipo, CAST(:dados AS JSONB), to_timestamp(:expiraEm / 1000.0))
         ON CONFLICT (user_id, tipo) DO UPDATE SET dados = EXCLUDED.dados, expira_em = EXCLUDED.expira_em`,
        { replacements: { userId, tipo, dados: JSON.stringify(valor), expiraEm: valor.expiraEm } }
      );
      // Faxina dos registros vencidos (tabela pequena).
      await db().query('DELETE FROM whatsapp_verificacoes WHERE expira_em < NOW()');
    },
    async del(userId, tipo) {
      await db().query('DELETE FROM whatsapp_verificacoes WHERE user_id = :userId AND tipo = :tipo', {
        replacements: { userId, tipo },
      });
    },
    async limpar() {
      await db().query('DELETE FROM whatsapp_verificacoes');
    },
  };
}

let store = process.env.NODE_ENV === 'test' ? criarMemoria() : criarBanco();

// ── Regras ─────────────────────────────────────────────────────────────────

function hashCodigo(userId, codigo) {
  return crypto.createHash('sha256').update(`${userId}:${codigo}`).digest('hex');
}

function normalizarNumero(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/** Aceita DDD + número (10 ou 11 dígitos), com ou sem o 55 na frente. */
function numeroValido(numero) {
  return /^(55)?\d{10,11}$/.test(numero);
}

/**
 * Gera um código novo para o usuário.
 * @returns {Promise<{ ok: true, codigo: string } | { ok: false, motivo: 'aguarde', segundos: number }>}
 */
async function gerarCodigo(userId, numero, agora = Date.now()) {
  const atual = await store.get(userId, 'pendente');
  if (atual && agora - atual.enviadoEm < INTERVALO_REENVIO_MS) {
    return { ok: false, motivo: 'aguarde', segundos: Math.ceil((INTERVALO_REENVIO_MS - (agora - atual.enviadoEm)) / 1000) };
  }
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await store.set(userId, 'pendente', {
    numero,
    hash: hashCodigo(userId, codigo),
    expiraEm: agora + VALIDADE_CODIGO_MS,
    tentativas: 0,
    enviadoEm: agora,
  });
  return { ok: true, codigo };
}

/** Descarta o código pendente (ex.: quando o envio pelo WhatsApp falhou). */
async function cancelarCodigo(userId) {
  await store.del(userId, 'pendente');
}

/**
 * Confere o código digitado.
 * @returns {Promise<{ ok: true, numero: string } | { ok: false, motivo: 'sem_codigo' | 'expirado' | 'tentativas' | 'invalido', restantes?: number }>}
 */
async function confirmarCodigo(userId, codigo, agora = Date.now()) {
  const atual = await store.get(userId, 'pendente');
  if (!atual) return { ok: false, motivo: 'sem_codigo' };
  if (agora > atual.expiraEm) {
    await store.del(userId, 'pendente');
    return { ok: false, motivo: 'expirado' };
  }
  if (atual.tentativas >= MAX_TENTATIVAS) {
    await store.del(userId, 'pendente');
    return { ok: false, motivo: 'tentativas' };
  }
  const digitado = String(codigo || '').replace(/\D/g, '');
  if (hashCodigo(userId, digitado) !== atual.hash) {
    const tentativas = atual.tentativas + 1;
    await store.set(userId, 'pendente', { ...atual, tentativas });
    return { ok: false, motivo: 'invalido', restantes: MAX_TENTATIVAS - tentativas };
  }
  await store.del(userId, 'pendente');
  await store.set(userId, 'confirmado', { numero: atual.numero, expiraEm: agora + VALIDADE_CONFIRMACAO_MS });
  return { ok: true, numero: atual.numero };
}

/** Número confirmado recentemente pelo usuário (ou null). */
async function numeroConfirmado(userId, agora = Date.now()) {
  const c = await store.get(userId, 'confirmado');
  if (!c) return null;
  if (agora > c.expiraEm) {
    await store.del(userId, 'confirmado');
    return null;
  }
  return c.numero;
}

async function consumirConfirmacao(userId) {
  await store.del(userId, 'confirmado');
}

async function _limparTudo() {
  await store.limpar();
}

/** Só para testes: troca o armazenamento. */
function _usarArmazenamento(tipo) {
  store = tipo === 'banco' ? criarBanco() : criarMemoria();
}

module.exports = {
  normalizarNumero,
  numeroValido,
  gerarCodigo,
  cancelarCodigo,
  confirmarCodigo,
  numeroConfirmado,
  consumirConfirmacao,
  _limparTudo,
  _usarArmazenamento,
  MAX_TENTATIVAS,
};
