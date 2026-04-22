const iconv = require('iconv-lite');
const { createUpstreamAxios, axiosWithRetries } = require('./httpUpstream');

/**
 * CPTEC/INPE — serviços XML públicos.
 * Documentação oficial (URLs e parâmetros): https://servicos.cptec.inpe.br/XML/
 */
function getBaseUrl() {
  return (process.env.CPTEC_BASE_URL || 'http://servicos.cptec.inpe.br/XML').replace(/\/$/, '');
}

function stripAccents(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function fetchText(path) {
  const client = createUpstreamAxios({
    baseURL: getBaseUrl(),
    // Serviço público INPE costuma demorar ou responder 5xx; 25s falha em massa em horários de pico.
    timeoutMs: Number(process.env.CPTEC_TIMEOUT_MS || 60000)
  });
  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url: path,
      responseType: 'arraybuffer'
    },
    {
      retries: Number(process.env.CPTEC_HTTP_RETRIES || 4),
      retryDelayMs: Number(process.env.CPTEC_RETRY_DELAY_MS || 1500)
    }
  );
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`CPTEC HTTP ${res.status}`);
    err.details = Buffer.from(res.data || []).toString('utf8').slice(0, 400);
    throw err;
  }
  return iconv.decode(Buffer.from(res.data), 'latin1');
}

function parseListaCidades(xml) {
  const out = [];
  const blocks = xml.match(/<cidade>[\s\S]*?<\/cidade>/g) || [];
  for (const b of blocks) {
    const id = (b.match(/<id>(\d+)<\/id>/) || [])[1];
    const nome = (b.match(/<nome>([^<]*)<\/nome>/) || [])[1];
    const uf = (b.match(/<uf>([^<]*)<\/uf>/) || [])[1];
    if (id) out.push({ id: parseInt(id, 10), nome, uf });
  }
  return out;
}

function parsePrevisaoBlocks(xml) {
  const items = [];
  const re = /<previsao>[\s\S]*?<\/previsao>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const dia = (b.match(/<dia>([^<]+)<\/dia>/) || [])[1];
    const maxima = parseFloat((b.match(/<maxima>([^<]+)<\/maxima>/) || [])[1]);
    const minima = parseFloat((b.match(/<minima>([^<]+)<\/minima>/) || [])[1]);
    const tempo = (b.match(/<tempo>([^<]*)<\/tempo>/) || [])[1];
    const iuvRaw = (b.match(/<iuv>([^<]*)<\/iuv>/) || [])[1];
    const iuv = parseFloat(iuvRaw);
    if (dia && Number.isFinite(maxima) && Number.isFinite(minima)) {
      items.push({
        dia,
        maxima,
        minima,
        tempo: tempo || null,
        iuv: Number.isFinite(iuv) ? iuv : null
      });
    }
  }
  return items;
}

async function searchCities(cityQuery) {
  const q = encodeURIComponent(stripAccents(cityQuery).toLowerCase().trim());
  const xml = await fetchText(`/listaCidades?city=${q}`);
  return parseListaCidades(xml);
}

async function pickLocalityIdForState(cityQuery, expectedUf) {
  const cities = await searchCities(cityQuery);
  const uf = (expectedUf || '').toUpperCase();
  const match = cities.find((c) => (c.uf || '').toUpperCase() === uf);
  return match ? match.id : cities[0]?.id || null;
}

/**
 * Previsão 4 dias — URL documentada: /cidade/{id}/previsao.xml
 */
async function fetchForecast4DaysByLocalityId(localityId) {
  const xml = await fetchText(`/cidade/${localityId}/previsao.xml`);
  const nome = (xml.match(/<nome>([^<]*)<\/nome>/) || [])[1];
  const uf = (xml.match(/<uf>([^<]*)<\/uf>/) || [])[1];
  const atualizacao = (xml.match(/<atualizacao>([^<]*)<\/atualizacao>/) || [])[1];
  return {
    localityId,
    nome,
    uf,
    atualizacao,
    forecasts: parsePrevisaoBlocks(xml)
  };
}

/**
 * Previsão 7 dias — URL documentada: /cidade/7dias/{id}/previsao.xml
 */
async function fetchForecast7DaysByLocalityId(localityId) {
  const xml = await fetchText(`/cidade/7dias/${localityId}/previsao.xml`);
  const nome = (xml.match(/<nome>([^<]*)<\/nome>/) || [])[1];
  const uf = (xml.match(/<uf>([^<]*)<\/uf>/) || [])[1];
  const atualizacao = (xml.match(/<atualizacao>([^<]*)<\/atualizacao>/) || [])[1];
  return {
    localityId,
    nome,
    uf,
    atualizacao,
    forecasts: parsePrevisaoBlocks(xml)
  };
}

/**
 * METAR REDEMET via CPTEC — URL documentada: /estacao/{ICAO}/condicoesAtuais.xml
 * Elementos: pressao, temperatura, tempo, tempo_desc, umidade, vento_dir, vento_int, visibilidade
 */
function parseMetarXml(xml) {
  const raw = (tag) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    return m ? String(m[1]).trim() : null;
  };
  const num = (tag) => {
    const v = raw(tag);
    if (!v || v === 'undefined') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  return {
    codigo: raw('codigo'),
    atualizacao: raw('atualizacao'),
    pressao: num('pressao'),
    temperatura: num('temperatura'),
    tempo: raw('tempo'),
    tempo_desc: raw('tempo_desc'),
    umidade: num('umidade'),
    vento_dir: num('vento_dir'),
    vento_int: num('vento_int'),
    visibilidade: num('visibilidade')
  };
}

async function fetchMetarByIcao(icao) {
  const code = String(icao || '').toUpperCase();
  if (!code || code.length !== 4) return null;
  const xml = await fetchText(`/estacao/${code}/condicoesAtuais.xml`);
  return parseMetarXml(xml);
}

module.exports = {
  getBaseUrl,
  fetchText,
  searchCities,
  pickLocalityIdForState,
  fetchForecast4DaysByLocalityId,
  fetchForecast7DaysByLocalityId,
  fetchMetarByIcao,
  parsePrevisaoBlocks,
  parseMetarXml
};
