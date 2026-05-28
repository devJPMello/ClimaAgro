const axios = require('axios');

const MAX_CHARS = 1590;

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getConfig() {
  return {
    apiUrl: String(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE_NAME || 'climaagro',
  };
}

function isConfigured() {
  const { apiUrl, apiKey } = getConfig();
  return Boolean(apiUrl && apiKey);
}

function mimeToEvolutionType(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Divide texto longo em partes de até MAX_CHARS,
 * quebrando em parágrafo > linha > palavra.
 */
function splitIntoChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > MAX_CHARS) {
    let splitAt = MAX_CHARS;

    const lastPara = remaining.lastIndexOf('\n\n', MAX_CHARS);
    if (lastPara > MAX_CHARS / 2) {
      splitAt = lastPara;
    } else {
      const lastLine = remaining.lastIndexOf('\n', MAX_CHARS);
      if (lastLine > MAX_CHARS / 2) {
        splitAt = lastLine;
      } else {
        const lastSpace = remaining.lastIndexOf(' ', MAX_CHARS);
        if (lastSpace > MAX_CHARS / 2) splitAt = lastSpace;
      }
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Envia mensagem de texto via Evolution API.
 * Se o texto ultrapassar MAX_CHARS, envia em múltiplas mensagens sequenciais.
 * Retorna { sent, sid?, parts?, reason?, detail? } — nunca lança exceção.
 */
async function sendMessage(toDigits, text) {
  if (!isConfigured()) {
    return { sent: false, reason: 'whatsapp_not_configured' };
  }
  const digits = normalizeDigits(toDigits);
  if (!digits || digits.length < 10) {
    return { sent: false, reason: 'invalid_number' };
  }

  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const { apiUrl, apiKey, instance } = getConfig();
  const chunks = splitIntoChunks(String(text || ''));

  try {
    let lastId = null;
    for (let i = 0; i < chunks.length; i++) {
      const body = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i];
      const res = await axios.post(
        `${apiUrl}/message/sendText/${instance}`,
        { number, text: body },
        { headers: { apikey: apiKey }, timeout: 15000 }
      );
      lastId = res.data?.key?.id || res.data?.id || null;
      console.log(`[Evolution] Parte ${i + 1}/${chunks.length} enviada. id: ${lastId}`);
    }
    return { sent: true, sid: lastId, parts: chunks.length };
  } catch (e) {
    const detail = e.response?.data?.message || e.message || 'Erro Evolution API';
    console.error('[Evolution] sendMessage failed:', detail);
    return { sent: false, reason: 'whatsapp_api_error', detail: String(detail).slice(0, 600) };
  }
}

/**
 * Envia mídia (imagem, PDF, áudio, vídeo) via Evolution API usando base64.
 * @param {string} toDigits — número do destinatário (só dígitos)
 * @param {string} caption — legenda da mídia
 * @param {Buffer} buffer — conteúdo binário do arquivo
 * @param {string} mimeType — MIME type do arquivo (ex.: "image/jpeg", "application/pdf")
 */
async function sendMedia(toDigits, caption, buffer, mimeType) {
  if (!isConfigured()) {
    return { sent: false, reason: 'whatsapp_not_configured' };
  }
  const digits = normalizeDigits(toDigits);
  if (!digits || digits.length < 10) {
    return { sent: false, reason: 'invalid_number' };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return sendMessage(toDigits, caption);
  }

  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const { apiUrl, apiKey, instance } = getConfig();
  const mediatype = mimeToEvolutionType(mimeType);
  const safeCaption = String(caption || '').trim().slice(0, MAX_CHARS);

  try {
    const res = await axios.post(
      `${apiUrl}/message/sendMedia/${instance}`,
      {
        number,
        mediatype,
        mimetype: mimeType,
        caption: safeCaption,
        media: buffer.toString('base64'),
      },
      { headers: { apikey: apiKey }, timeout: 30000 }
    );
    const id = res.data?.key?.id || res.data?.id || null;
    return { sent: true, sid: id };
  } catch (e) {
    const detail = e.response?.data?.message || e.message || 'Erro Evolution API';
    console.error('[Evolution] sendMedia failed:', detail);
    return { sent: false, reason: 'whatsapp_api_error', detail: String(detail).slice(0, 600) };
  }
}

module.exports = { sendMessage, sendMedia, isConfigured };
