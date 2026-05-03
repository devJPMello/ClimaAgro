const twilio = require('twilio');

const MAX_CHARS = 1590;

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
  };
}

function isConfigured() {
  const { accountSid, authToken } = getConfig();
  return Boolean(accountSid && authToken);
}

/**
 * Divide texto longo em partes de até MAX_CHARS,
 * quebrando em parágrafo > linha > palavra — nunca no meio de uma palavra.
 */
function splitIntoChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > MAX_CHARS) {
    let splitAt = MAX_CHARS;

    // Tenta quebrar em parágrafo (\n\n)
    const lastPara = remaining.lastIndexOf('\n\n', MAX_CHARS);
    if (lastPara > MAX_CHARS / 2) {
      splitAt = lastPara;
    } else {
      // Tenta quebrar em linha (\n)
      const lastLine = remaining.lastIndexOf('\n', MAX_CHARS);
      if (lastLine > MAX_CHARS / 2) {
        splitAt = lastLine;
      } else {
        // Tenta quebrar em espaço (palavra)
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
 * Envia mensagem de texto via Twilio WhatsApp Sandbox.
 * Se o texto ultrapassar 1590 chars, envia em múltiplas mensagens sequenciais.
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
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const { accountSid, authToken, from } = getConfig();
  const to = `whatsapp:+${number}`;

  const chunks = splitIntoChunks(String(text || ''));

  try {
    const client = twilio(accountSid, authToken);
    let lastSid = null;

    for (let i = 0; i < chunks.length; i++) {
      const body = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i];
      const message = await client.messages.create({ from, to, body });
      lastSid = message.sid;
      console.log(`[Twilio] Parte ${i + 1}/${chunks.length} enviada. SID: ${message.sid}`);
    }

    return { sent: true, sid: lastSid, parts: chunks.length };
  } catch (e) {
    let detail = e.message || 'Erro Twilio';
    if (e.code === 63015) {
      detail =
        'Número não inscrito no Sandbox Twilio. O agrônomo precisa enviar "join <código>" para o número do sandbox antes de receber mensagens.';
    }
    console.error('[Twilio] sendMessage failed:', detail);
    return { sent: false, reason: 'whatsapp_api_error', detail: detail.slice(0, 600) };
  }
}

module.exports = { sendMessage, isConfigured };
