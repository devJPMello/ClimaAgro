const crypto = require('crypto');

/**
 * Confirmação de número de WhatsApp por código de 6 dígitos.
 *
 * Os códigos ficam em memória (o servidor roda em uma instância só). Se o
 * servidor reiniciar, o usuário só precisa pedir um código novo.
 */

const VALIDADE_CODIGO_MS = 10 * 60 * 1000;
const VALIDADE_CONFIRMACAO_MS = 30 * 60 * 1000;
const INTERVALO_REENVIO_MS = 60 * 1000;
const MAX_TENTATIVAS = 5;

const pendentes = new Map(); // userId -> { numero, hash, expiraEm, tentativas, enviadoEm }
const confirmados = new Map(); // userId -> { numero, expiraEm }

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
 * @returns {{ ok: true, codigo: string } | { ok: false, motivo: 'aguarde', segundos: number }}
 */
function gerarCodigo(userId, numero, agora = Date.now()) {
  const atual = pendentes.get(userId);
  if (atual && agora - atual.enviadoEm < INTERVALO_REENVIO_MS) {
    return { ok: false, motivo: 'aguarde', segundos: Math.ceil((INTERVALO_REENVIO_MS - (agora - atual.enviadoEm)) / 1000) };
  }
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pendentes.set(userId, {
    numero,
    hash: hashCodigo(userId, codigo),
    expiraEm: agora + VALIDADE_CODIGO_MS,
    tentativas: 0,
    enviadoEm: agora,
  });
  return { ok: true, codigo };
}

/** Descarta o código pendente (ex.: quando o envio pelo WhatsApp falhou). */
function cancelarCodigo(userId) {
  pendentes.delete(userId);
}

/**
 * Confere o código digitado.
 * @returns {{ ok: true, numero: string } | { ok: false, motivo: 'sem_codigo' | 'expirado' | 'tentativas' | 'invalido', restantes?: number }}
 */
function confirmarCodigo(userId, codigo, agora = Date.now()) {
  const atual = pendentes.get(userId);
  if (!atual) return { ok: false, motivo: 'sem_codigo' };
  if (agora > atual.expiraEm) {
    pendentes.delete(userId);
    return { ok: false, motivo: 'expirado' };
  }
  if (atual.tentativas >= MAX_TENTATIVAS) {
    pendentes.delete(userId);
    return { ok: false, motivo: 'tentativas' };
  }
  const digitado = String(codigo || '').replace(/\D/g, '');
  if (hashCodigo(userId, digitado) !== atual.hash) {
    atual.tentativas += 1;
    return { ok: false, motivo: 'invalido', restantes: MAX_TENTATIVAS - atual.tentativas };
  }
  pendentes.delete(userId);
  confirmados.set(userId, { numero: atual.numero, expiraEm: agora + VALIDADE_CONFIRMACAO_MS });
  return { ok: true, numero: atual.numero };
}

/** Número confirmado recentemente pelo usuário (ou null). */
function numeroConfirmado(userId, agora = Date.now()) {
  const c = confirmados.get(userId);
  if (!c) return null;
  if (agora > c.expiraEm) {
    confirmados.delete(userId);
    return null;
  }
  return c.numero;
}

function consumirConfirmacao(userId) {
  confirmados.delete(userId);
}

function _limparTudo() {
  pendentes.clear();
  confirmados.clear();
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
  MAX_TENTATIVAS,
};
