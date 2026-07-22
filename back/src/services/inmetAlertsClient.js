const { createUpstreamAxios, axiosWithRetries } = require('./httpUpstream');

/**
 * Ingestão de avisos oficiais via JSON hospedado/configurado pelo time.
 * O portal INMET (ex.: https://alertas2.inmet.gov.br/) não expõe aqui um endpoint estável documentado para automação;
 * o fluxo consistente é: ETL/serviço publicar JSON em `INMET_ALERTS_JSON_URL` no contrato de `syncOfficialAlertsFromJson` (ver DATA_SOURCES.md).
 */

function normalizeSeverity(sev) {
  const raw = String(sev || '')
    .toLowerCase()
    .trim();
  if (['low', 'medium', 'high', 'critical'].includes(raw)) return raw;
  const s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (s.includes('extrem')) return 'critical';
  if (s.includes('grav') || s.includes('sever') || s.includes('alta')) return 'high';
  if (s.includes('moder')) return 'medium';
  if (s.includes('baix') || s.includes('frac')) return 'low';
  return 'medium';
}

function parseHttpsUrlList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });
}

/**
 * Busca e normaliza alertas a partir de várias URLs HTTPS (contrato igual a `INMET_ALERTS_JSON_URL`).
 * Usado em leitura ao vivo opcional (GET /climate/alerts); URLs vêm só de variável de ambiente controlada pelo time.
 */
async function fetchAlertsFromUrlList(urlsRaw) {
  const urls = parseHttpsUrlList(urlsRaw);
  const merged = [];
  const seen = new Set();
  for (const url of urls) {
    try {
      const data = await fetchAlertsJson(url);
      for (const item of normalizeBundle(data)) {
        if (seen.has(item.externalId)) continue;
        seen.add(item.externalId);
        merged.push(item);
      }
    } catch {
      // Ignorar URL instável; sync/DB continua sendo a fonte principal.
    }
  }
  return merged;
}

async function fetchAlertsJson(url) {
  const client = createUpstreamAxios({ baseURL: undefined, timeoutMs: 25000 });
  const res = await axiosWithRetries(client, { method: 'GET', url, responseType: 'json', headers: { Accept: 'application/json' } });
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`INMET_ALERTS_JSON_URL HTTP ${res.status}`);
    err.response = res;
    throw err;
  }
  return res.data;
}

/**
 * Espera um objeto { updatedAt?: string, items: Array<...> } ou um array direto.
 * Cada item: { id, severidade?, title|titulo, description|descricao?, validFrom|vigenciaInicio, validTo|vigenciaFim, states|estados?: string[] }
 */
function normalizeBundle(data) {
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return items
    .map((it) => {
      const externalId = String(it.id || it.externalId || '').trim();
      if (!externalId) return null;
      const title = String(it.title || it.titulo || '').trim();
      const description = String(it.description || it.descricao || '').trim();
      const validFrom = String(it.validFrom || it.vigenciaInicio || it.inicio || '').slice(0, 10);
      const validTo = String(it.validTo || it.vigenciaFim || it.fim || validFrom).slice(0, 10);
      const states = Array.isArray(it.states) ? it.states : Array.isArray(it.estados) ? it.estados : [];
      const cities = Array.isArray(it.cidades)
        ? it.cidades
        : Array.isArray(it.cities)
          ? it.cities
          : Array.isArray(it.payload?.cities)
            ? it.payload.cities
            : [];
      if (!title || !validFrom) return null;
      return {
        externalId,
        severityRaw: String(it.severidade || it.severity || ''),
        title,
        description,
        validFrom,
        validTo: validTo || validFrom,
        states: states.map((x) => String(x).toUpperCase().slice(0, 2)),
        // `it.payload` (quando presente, ex.: itens já normalizados via adapter RSS/CAP) carrega o `cap`
        // original (polygon/areaDesc). Preservar no nível raiz — não aninhar `it` inteiro de novo aqui,
        // senão `payload.cap` vira `payload.payload.cap` e o polígono fica inacessível para quem consome.
        payload: {
          ...(it.payload && typeof it.payload === 'object' ? it.payload : {}),
          cities: cities.map((x) => String(x).trim()).filter(Boolean)
        }
      };
    })
    .filter(Boolean);
}

module.exports = {
  fetchAlertsJson,
  fetchAlertsFromUrlList,
  parseHttpsUrlList,
  normalizeBundle,
  normalizeSeverity
};
