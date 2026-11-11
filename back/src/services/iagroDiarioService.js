const { TIPOS, _internos } = require('./diarioService');

/*
 * O IAgro nunca grava no Diário de Campo sozinho: quando o usuário pede para anotar algo, o modelo
 * termina a resposta com uma linha [[DIARIO:{...}]]. O servidor tira essa linha do texto, valida os campos
 * e devolve uma "anotação proposta", que o front mostra num cartão. Só o clique em Confirmar grava.
 */

const MARCADOR = /\[\[DIARIO:\s*(\{[\s\S]*?\})\s*\]\]/g;

function limpa(texto, max) {
  return String(texto ?? '').trim().slice(0, max);
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD). */
function hojeBrasilia(agora = new Date()) {
  return agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/** Trecho do prompt que ensina o modelo a propor a anotação. */
function instrucaoDiario(hoje) {
  return [
    `Diário de Campo: hoje é ${hoje}. Quando (e somente quando) o usuário pedir explicitamente para anotar, registrar ou lançar algo no Diário de Campo, responda em uma ou duas frases dizendo o que será anotado e que ele precisa confirmar no cartão que aparece abaixo da resposta; e termine a resposta com UMA linha no formato exato:`,
    `[[DIARIO:{"tipo":"plantio","data":"AAAA-MM-DD","cultura":"soja","municipio":"","observacao":"texto curto e fiel ao que o usuário disse"}]]`,
    `Valores de "tipo": ${TIPOS.join(', ')}. Converta "hoje", "ontem", "anteontem" e "semana passada" em data real usando a data de hoje; se o usuário não disser a data, use a de hoje. Use apenas o que o usuário disse: não invente cultura, produto, dose, área ou município. Em qualquer outra situação, NÃO escreva o marcador [[DIARIO:...]].`,
  ].join('\n');
}

/** Remove qualquer marcador do texto (usado também no contexto enviado de volta ao modelo). */
function removerMarcador(texto) {
  return String(texto || '').replace(MARCADOR, '').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizar(bruto, { hoje, ufPerfil, municipioPerfil }) {
  if (!bruto || typeof bruto !== 'object') return null;
  const observacao = limpa(bruto.observacao, 2000);
  if (!observacao) return null;
  const data = _internos.dataValida(bruto.data) && bruto.data <= hoje ? bruto.data : hoje;
  return {
    data,
    tipo: TIPOS.includes(bruto.tipo) ? bruto.tipo : 'observacao',
    cultura: limpa(bruto.cultura, 60),
    uf: /^[A-Z]{2}$/.test(String(ufPerfil || '').toUpperCase()) ? String(ufPerfil).toUpperCase() : '',
    municipio: limpa(bruto.municipio, 80) || limpa(municipioPerfil, 80),
    observacao,
  };
}

/**
 * Separa o texto da resposta e a anotação proposta (se houver e se for válida).
 * @returns {{ texto: string, anotacao: object | null }}
 */
function extrairAnotacao(resposta, contexto = {}) {
  const original = String(resposta || '');
  const ctx = { hoje: hojeBrasilia(), ...contexto };
  let anotacao = null;
  for (const m of original.matchAll(MARCADOR)) {
    try {
      anotacao = normalizar(JSON.parse(m[1]), ctx);
    } catch {
      anotacao = null;
    }
    if (anotacao) break;
  }
  return { texto: removerMarcador(original), anotacao };
}

module.exports = { instrucaoDiario, removerMarcador, extrairAnotacao, hojeBrasilia };
