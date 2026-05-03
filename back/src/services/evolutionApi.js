const axios = require('axios');

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getConfig() {
  return {
    url: String(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, ''),
    key: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE_NAME || '',
  };
}

function isConfigured() {
  const { url, key, instance } = getConfig();
  return Boolean(url && key && instance);
}

/**
 * Envia mensagem de texto via Evolution API.
 * Retorna { sent, reason?, detail? } — nunca lança exceção.
 */
async function sendMessage(toDigits, text) {
  if (!isConfigured()) {
    return { sent: false, reason: 'whatsapp_not_configured' };
  }
  const digits = normalizeDigits(toDigits);
  if (!digits || digits.length < 10) {
    return { sent: false, reason: 'invalid_number' };
  }
  // Evolution espera apenas dígitos com DDI (sem + nem whatsapp:)
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const { url, key, instance } = getConfig();
  try {
    await axios.post(
      `${url}/message/sendText/${instance}`,
      { number, text: String(text || '').slice(0, 4096) },
      {
        headers: { apikey: key, 'Content-Type': 'application/json' },
        timeout: 20000,
      }
    );
    return { sent: true };
  } catch (e) {
    const data = e.response?.data;
    let detail = e.message || 'Erro Evolution API';
    if (data && typeof data === 'object' && (data.message || data.error)) {
      detail = String(data.message || data.error);
    } else if (typeof data === 'string' && data.length < 800) {
      detail = data;
    }
    if (e.response?.status) detail = `[HTTP ${e.response.status}] ${detail}`;
    console.error('[Evolution API] sendMessage failed:', detail);
    return { sent: false, reason: 'whatsapp_api_error', detail: detail.slice(0, 600) };
  }
}

/**
 * Baixa mídia de uma mensagem e retorna { buffer, mimeType }.
 * Lança exceção em caso de falha — o chamador deve tratar.
 */
async function getMediaBuffer(messageKey, messageData) {
  const { url, key, instance } = getConfig();
  const response = await axios.post(
    `${url}/chat/getBase64FromMediaMessage/${instance}`,
    { message: { key: messageKey, message: messageData } },
    { headers: { apikey: key }, timeout: 30000 }
  );
  const b64 = response.data?.base64;
  const mimeType = response.data?.mimetype || 'application/octet-stream';
  if (!b64) throw new Error('Evolution API: base64 ausente na resposta de mídia');
  return { buffer: Buffer.from(b64, 'base64'), mimeType };
}

module.exports = { sendMessage, getMediaBuffer, isConfigured };
