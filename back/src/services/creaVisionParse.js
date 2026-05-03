const axios = require('axios');
const { BRAZIL_UFS } = require('../utils/brazilUfs');

/**
 * Chama Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 * Defina GOOGLE_CLOUD_VISION_API_KEY no .env.
 */
async function extractTextWithGoogleVision(imageBuffer) {
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!key || typeof key !== 'string') {
    return { fullText: null, error: 'missing_api_key' };
  }

  const b64 = imageBuffer.toString('base64');
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content: b64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      },
    ],
  };

  try {
    const { data } = await axios.post(url, body, { timeout: 60000 });
    const ann = data?.responses?.[0]?.fullTextAnnotation;
    const fullText = ann?.text || '';
    if (!fullText.trim()) {
      return { fullText: null, error: 'no_text' };
    }
    return { fullText: fullText.trim(), error: null };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'vision_request_failed';
    return { fullText: null, error: msg };
  }
}

function formatCpfDigits(d) {
  const digits = String(d || '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function extractCpf(text) {
  const m = text.match(/\b(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})[\s-]?(\d{2})\b/);
  if (m) return formatCpfDigits(m.slice(1).join(''));
  const plain = text.match(/\b(\d{11})\b/);
  return plain ? formatCpfDigits(plain[1]) : null;
}

function extractUf(text) {
  const labeled = text.match(/(?:UF|U\.?\s*F\.?|Estado)\s*[:\s.-]*\b([A-Z]{2})\b/i);
  if (labeled && BRAZIL_UFS.includes(labeled[1].toUpperCase())) {
    return labeled[1].toUpperCase();
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[A-Z]{2}$/.test(line) && BRAZIL_UFS.includes(line)) return line;
  }
  const anywhere = text.match(/\b(SP|RJ|MG|PR|RS|SC|BA|GO|PE|CE|PA|MA|ES|PB|RN|PI|AL|SE|MT|MS|DF|RO|AC|AM|RR|AP|TO)\b/);
  return anywhere && BRAZIL_UFS.includes(anywhere[1]) ? anywhere[1] : null;
}

/**
 * Número de registro profissional (carteira CREA varia por regional).
 */
function extractCreaRegistration(text) {
  const labeled = text.match(
    /\b(?:CREA|Registro|N[º°o]?\.?\s*(?:do\s*)?(?:Registro|CREA))\s*[:\s.-]*([^\n\r]{3,42})/i
  );
  if (labeled) {
    const chunk = labeled[1].replace(/\s+/g, ' ').trim();
    if (/\d/.test(chunk)) return chunk.slice(0, 32);
  }
  const ufNum = text.match(/\b([A-Z]{2})\s*[-/]\s*(\d{4,8})\b/);
  if (ufNum && BRAZIL_UFS.includes(ufNum[1])) {
    return `${ufNum[1]}-${ufNum[2]}`;
  }
  const numSlash = text.match(/\b(\d{6,9})\s*[/\-]\s*([A-Z])\b/i);
  if (numSlash) return `${numSlash[1]}-${numSlash[2].toUpperCase()}`;
  return null;
}

function cleanNameLine(line) {
  return line
    .replace(/^\d+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function extractFullName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/^nome\b|^profissional\b|^engenheiro/i.test(lines[i]) && lines[i + 1]) {
      const candidate = cleanNameLine(lines[i + 1]);
      if (candidate.length >= 5 && /[a-záéíóúãõç]/i.test(candidate)) return candidate;
    }
  }

  for (const line of lines.slice(0, 12)) {
    if (line.length < 6 || line.length > 100) continue;
    if (/\d{3}\.\d{3}/.test(line) || /\d{11}/.test(line)) continue;
    if (/^CREA|^REGISTRO|^CPF|^CARTEIRA|^UF\b|^BRASIL|^REPÚBLICA|^RNP|^INSTITUTO/i.test(line)) continue;
    if (/^[A-Z]{2}$/.test(line) && BRAZIL_UFS.includes(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 10) {
      const mostlyLetters = line.replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, '').trim();
      if (mostlyLetters.length >= 6 && /[A-Za-zÀ-ÿ]{2,}/.test(mostlyLetters)) {
        return cleanNameLine(mostlyLetters);
      }
    }
  }

  return null;
}

/**
 * @returns {{ fullName: string|null, creaRegistrationNumber: string|null, creaUf: string|null, cpf: string|null }}
 */
function parseCreaCardText(fullText) {
  if (!fullText || typeof fullText !== 'string') {
    return { fullName: null, creaRegistrationNumber: null, creaUf: null, cpf: null };
  }

  return {
    fullName: extractFullName(fullText),
    creaRegistrationNumber: extractCreaRegistration(fullText),
    creaUf: extractUf(fullText),
    cpf: extractCpf(fullText),
  };
}

async function extractAndParseCreaFields(imageBuffer) {
  const vision = await extractTextWithGoogleVision(imageBuffer);
  if (!vision.fullText) {
    return {
      extracted: { fullName: null, creaRegistrationNumber: null, creaUf: null, cpf: null },
      visionError: vision.error,
      rawText: null,
    };
  }

  const extracted = parseCreaCardText(vision.fullText);
  return {
    extracted,
    visionError: null,
    rawText: process.env.NODE_ENV === 'development' ? vision.fullText.slice(0, 8000) : undefined,
  };
}

module.exports = {
  extractTextWithGoogleVision,
  parseCreaCardText,
  extractAndParseCreaFields,
};
