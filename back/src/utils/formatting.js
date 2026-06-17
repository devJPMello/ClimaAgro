function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phonesMatch(stored, inbound) {
  const s = normalizeDigits(stored);
  const i = normalizeDigits(inbound);
  if (!s || !i) return false;
  if (s === i) return true;
  if (i.endsWith(s) || s.endsWith(i)) return true;
  if (s.slice(-9) === i.slice(-9)) return true;
  return false;
}

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.audioMessage?.caption ||
    ''
  );
}

module.exports = { normalizeDigits, phonesMatch, extractText };
