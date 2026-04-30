const { createUpstreamAxios, axiosWithRetries } = require('./httpUpstream');

function getInmetApiBaseUrl() {
  return (process.env.INMET_ADAPTER_BASE_URL || 'https://apitempo.inmet.gov.br').replace(/\/$/, '');
}

function getInmetAlertRssUrl() {
  return process.env.INMET_ADAPTER_ALERT_RSS_URL || 'https://apiprevmet3.inmet.gov.br/avisos/rss';
}

function parseStationCodes(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtDateOnlyBr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function pickNum(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const n = toNum(obj[k]);
    if (n == null) continue;
    if (n === 9999 || n === -9999) continue;
    return n;
  }
  return null;
}

function pickStr(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    return s;
  }
  return null;
}

function dateOnly(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return null;
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, x) => a + x, 0) / arr.length;
}

const UF_NAME_PATTERNS = [
  { uf: 'AC', pattern: /\bacre\b/i },
  { uf: 'AL', pattern: /\balagoas\b/i },
  { uf: 'AP', pattern: /\bamapa\b/i },
  { uf: 'AM', pattern: /\bamazonas\b/i },
  { uf: 'BA', pattern: /\bbahia\b/i },
  { uf: 'CE', pattern: /\bceara\b/i },
  { uf: 'DF', pattern: /\bdistrito federal\b/i },
  { uf: 'ES', pattern: /\bespirito santo\b/i },
  { uf: 'GO', pattern: /\bgoias\b/i },
  { uf: 'MA', pattern: /\bmaranhao\b/i },
  { uf: 'MT', pattern: /\bmato-grosso\b|\bmato grosso\b/i },
  { uf: 'MS', pattern: /\bmato-grosso do sul\b|\bmato grosso do sul\b/i },
  { uf: 'MG', pattern: /\bminas gerais\b/i },
  // "PA" não pode casar a preposição "para" em frases genéricas (ex.: "alerta para...").
  // Mantemos apenas contextos explícitos de estado.
  { uf: 'PA', pattern: /\bestado do para\b|\bpara\s*\(pa\)\b|\bpa\s*-\s*para\b/i },
  { uf: 'PB', pattern: /\bparaiba\b/i },
  { uf: 'PR', pattern: /\bparana\b/i },
  { uf: 'PE', pattern: /\bpernambuco\b/i },
  { uf: 'PI', pattern: /\bpiaui\b/i },
  { uf: 'RJ', pattern: /\brio de janeiro\b/i },
  { uf: 'RN', pattern: /\brio grande do norte\b/i },
  // Mesorregiões RS costumam usar "Rio-grandense" sem citar o nome completo do estado.
  { uf: 'RS', pattern: /\brio grande do sul\b|\brio-?grandenses?\b/i },
  { uf: 'RO', pattern: /\brondonia\b/i },
  { uf: 'RR', pattern: /\broraima\b/i },
  { uf: 'SC', pattern: /\bsanta catarina\b/i },
  { uf: 'SP', pattern: /\bsao paulo\b/i },
  { uf: 'SE', pattern: /\bsergipe\b/i },
  { uf: 'TO', pattern: /\btocantins\b/i }
];

const TO_REGION_HINTS = [
  /\boriental do tocantins\b/i,
  /\bocidental do tocantins\b/i,
  /\bpalmas\b/i,
  /\baraguaina\b/i,
  /\bgurupi\b/i,
  /\bporto nacional\b/i,
  /\bparaiso do tocantins\b/i,
  /\bguarai\b/i
];

const TO_CITY_PATTERNS = [
  { key: 'palmas', label: 'Palmas', re: /\bpalmas\b/i },
  { key: 'araguaina', label: 'Araguaína', re: /\baraguaina\b/i },
  { key: 'gurupi', label: 'Gurupi', re: /\bgurupi\b/i },
  { key: 'porto nacional', label: 'Porto Nacional', re: /\bporto nacional\b/i },
  { key: 'paraiso do tocantins', label: 'Paraíso do Tocantins', re: /\bparaiso do tocantins\b/i },
  { key: 'guarai', label: 'Guaraí', re: /\bguarai\b/i }
];

function stripUrlsForStateScan(text) {
  return String(text || '').replace(/https?:\/\/[^\s<>"']+/gi, ' ');
}

/** Evita falso "PA" por segmentos de URL (ex.: .../PA/...) ou códigos soltos no XML. */
function hasStrictParaStateHint(text) {
  const t = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ');
  return (
    /\bestado do para\b|\bpara\s*\(pa\)\b|\bpa\s*-\s*para\b/i.test(t) ||
    /\bbel[eé]m\b.*\bpa\b|\bpa\b.*\bbel[eé]m\b/i.test(t)
  );
}

function extractUfList(text) {
  if (!text) return [];
  const raw = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
  // Siglas em caminhos de URL geram falsos positivos (ex.: "/PA/" ≠ Pará).
  const t = stripUrlsForStateScan(raw).replace(/\s+/g, ' ');
  const states = new Set();

  const byCode = t.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g);
  if (byCode) byCode.forEach((uf) => states.add(uf));

  for (const item of UF_NAME_PATTERNS) {
    if (item.pattern.test(t)) states.add(item.uf);
  }

  // INMET CAP costuma trazer mesorregiões ("Oriental do Tocantins"), sem sigla UF.
  if (TO_REGION_HINTS.some((re) => re.test(t))) states.add('TO');

  return [...states];
}

/**
 * Combina UFs persistidas (JSON/ETL) com extração do texto do aviso.
 * Corrige casos em que o armazenamento traz "PA" por engano mas o corpo cita RS (ex.: mesorregiões Rio-grandenses).
 */
function reconcileAlertStates(storedStates, fullText) {
  const stored = normalizeStateCodes(Array.isArray(storedStates) ? storedStates : []);
  const text = String(fullText || '');
  const extracted = extractUfList(text);
  let merged = [...new Set([...stored, ...extracted])];

  const rsStrong =
    /\brio\s+grande\s+do\s+sul\b|\brio-?grandenses?\b|\bgauch[oa]s?\b|\bserra\s+gauch/i.test(text);
  if (rsStrong && merged.includes('PA') && !hasStrictParaStateHint(text)) {
    merged = merged.filter((uf) => uf !== 'PA');
  }
  if (rsStrong && !merged.includes('RS')) merged.push('RS');

  return [...new Set(merged)].sort();
}

function normalizeStateCodes(values) {
  if (!Array.isArray(values)) return [];
  const out = values
    .map((x) => String(x || '').trim().toUpperCase())
    .filter((x) => /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(x));
  return [...new Set(out)];
}

function extractTocantinsCities(text) {
  if (!text) return [];
  const t = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
  const out = [];
  for (const c of TO_CITY_PATTERNS) {
    if (c.re.test(t)) out.push(c.label);
  }
  return [...new Set(out)];
}

async function fetchJsonAbsolute(url) {
  const client = createUpstreamAxios({ baseURL: undefined, timeoutMs: Number(process.env.INMET_ADAPTER_TIMEOUT_MS || 25000) });
  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      responseType: 'json'
    },
    { retries: 2 }
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`INMET adapter HTTP ${res.status} em ${url}`);
  }
  return res.data;
}

async function fetchTextAbsolute(url, accept = 'application/xml,text/xml,application/rss+xml,text/plain,*/*') {
  const client = createUpstreamAxios({ baseURL: undefined, timeoutMs: Number(process.env.INMET_ADAPTER_TIMEOUT_MS || 25000) });
  const res = await axiosWithRetries(
    client,
    {
      method: 'GET',
      url,
      headers: { Accept: accept },
      responseType: 'text'
    },
    { retries: 2 }
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`INMET adapter HTTP ${res.status} em ${url}`);
  }
  return typeof res.data === 'string' ? res.data : String(res.data || '');
}

async function fetchStationHourlyRange({ stationCode, startDate, endDate }) {
  const base = getInmetApiBaseUrl();
  const url = `${base}/estacao/${startDate}/${endDate}/${encodeURIComponent(stationCode)}`;
  const data = await fetchJsonAbsolute(url);
  return Array.isArray(data) ? data : [];
}

async function fetchStationsByUf(uf) {
  const base = getInmetApiBaseUrl();
  const token = String(uf || '').trim().toUpperCase();
  if (!token) return [];
  const url = `${base}/estacoes/${encodeURIComponent(token)}`;
  const data = await fetchJsonAbsolute(url);
  return Array.isArray(data) ? data : [];
}

function aggregateHourlyRowsToFeatures(rows, stationCode) {
  const buckets = new Map();
  for (const r of rows) {
    const date = dateOnly(pickStr(r, ['DT_MEDICAO', 'DATA_MEDICAO', 'DATA', 'date', 'datetime'])) || dateOnly(pickStr(r, ['DT_REFERENCIA']));
    if (!date) continue;

    const key = date;
    if (!buckets.has(key)) {
      buckets.set(key, {
        rows: [],
        lat: pickNum(r, ['VL_LATITUDE', 'latitude', 'lat']),
        lon: pickNum(r, ['VL_LONGITUDE', 'longitude', 'lon', 'lng']),
        stationId: pickStr(r, ['CD_ESTACAO', 'station_id', 'codigo', 'id']) || stationCode,
        stationName: pickStr(r, ['DC_NOME', 'name', 'estacao']) || stationCode
      });
    }
    buckets.get(key).rows.push(r);
  }

  const features = [];
  for (const [date, b] of buckets.entries()) {
    const tempsIns = [];
    const tempsMax = [];
    const tempsMin = [];
    const rains = [];
    const hums = [];
    const winds = [];
    const press = [];

    for (const r of b.rows) {
      const temIns = pickNum(r, ['TEM_INS']);
      if (temIns != null) tempsIns.push(temIns);
      const temMax = pickNum(r, ['TEM_MAX']);
      if (temMax != null) tempsMax.push(temMax);
      const temMin = pickNum(r, ['TEM_MIN']);
      if (temMin != null) tempsMin.push(temMin);

      const chuva = pickNum(r, ['CHUVA']);
      if (chuva != null) rains.push(chuva);

      const umd = pickNum(r, ['UMD_INS', 'UMD_MAX', 'UMD_MIN']);
      if (umd != null) hums.push(umd);

      const vel = pickNum(r, ['VEN_VEL']);
      if (vel != null) winds.push(vel * 3.6);

      const p = pickNum(r, ['PRE_INS', 'PRE_MAX', 'PRE_MIN']);
      if (p != null) press.push(p);
    }

    const tAvg = avg(tempsIns);
    const tMax = tempsMax.length ? Math.max(...tempsMax) : null;
    const tMin = tempsMin.length ? Math.min(...tempsMin) : null;
    const precip = rains.length ? rains.reduce((a, x) => a + x, 0) : null;
    const hum = avg(hums);
    const wind = avg(winds);
    const pressure = avg(press);

    if (tAvg == null && tMax == null && tMin == null && precip == null && hum == null && wind == null && pressure == null) {
      continue;
    }
    if (b.lon == null || b.lat == null) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
      properties: {
        date,
        station_id: b.stationId,
        name: b.stationName,
        avg_temperature: tAvg != null ? Number(tAvg.toFixed(2)) : null,
        max_temperature: tMax != null ? Number(tMax.toFixed(2)) : null,
        min_temperature: tMin != null ? Number(tMin.toFixed(2)) : null,
        precipitation: precip != null ? Number(precip.toFixed(2)) : null,
        humidity: hum != null ? Number(hum.toFixed(2)) : null,
        wind_speed: wind != null ? Number(wind.toFixed(2)) : null,
        pressure: pressure != null ? Number(pressure.toFixed(2)) : null,
        source: 'inmet-apitempo'
      }
    });
  }

  return features.sort((a, b) => String(a.properties.date).localeCompare(String(b.properties.date)));
}

async function buildFeatureCollectionFromApitempo({ startDate, endDate, stationCodes }) {
  const features = [];
  const errors = [];
  const emptyStations = [];
  const attemptedStations = [...stationCodes];

  for (const code of stationCodes) {
    try {
      const rows = await fetchStationHourlyRange({ stationCode: code, startDate, endDate });
      const stationFeatures = aggregateHourlyRowsToFeatures(rows, code);
      if (!stationFeatures.length) emptyStations.push(code);
      features.push(...stationFeatures);
    } catch (e) {
      errors.push({ stationCode: code, message: e.message || String(e) });
    }
  }

  const fallbackEnabled = process.env.INMET_ADAPTER_AUTO_FALLBACK !== 'false';
  if (!features.length && fallbackEnabled) {
    try {
      const uf = (process.env.INMET_ADAPTER_DEFAULT_UF || process.env.DEFAULT_APP_UF || 'TO').toUpperCase();
      const stations = await fetchStationsByUf(uf);
      const autoCodes = stations
        .filter((s) => String(s.CD_SITUACAO || '').toLowerCase() === 'operante')
        .filter((s) => String(s.TP_ESTACAO || '').toLowerCase().includes('automatica'))
        .map((s) => String(s.CD_ESTACAO || '').trim().toUpperCase())
        .filter(Boolean)
        .filter((c) => !attemptedStations.includes(c))
        .slice(0, Number(process.env.INMET_ADAPTER_AUTO_STATIONS_LIMIT || 8));

      for (const code of autoCodes) {
        attemptedStations.push(code);
        try {
          // eslint-disable-next-line no-await-in-loop
          const rows = await fetchStationHourlyRange({ stationCode: code, startDate, endDate });
          const stationFeatures = aggregateHourlyRowsToFeatures(rows, code);
          if (!stationFeatures.length) emptyStations.push(code);
          features.push(...stationFeatures);
        } catch (e) {
          errors.push({ stationCode: code, message: e.message || String(e), phase: 'autoFallback' });
        }
      }
    } catch (e) {
      errors.push({ message: e.message || String(e), phase: 'stationCatalogFallback' });
    }
  }

  return {
    type: 'FeatureCollection',
    generatedAt: new Date().toISOString(),
    features,
    metadata: {
      source: 'inmet-apitempo-adapter',
      startDate,
      endDate,
      stationCodes,
      attemptedStations,
      emptyStations: [...new Set(emptyStations)],
      errors
    }
  };
}

function pickTag(xml, tagName) {
  if (!xml) return null;
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = String(xml).match(re);
  if (!m) return null;
  return String(m[1]).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function severityToPt(sevRaw) {
  const s = String(sevRaw || '').toLowerCase();
  if (s.includes('extreme')) return 'extrema';
  if (s.includes('severe') || s.includes('high')) return 'alta';
  if (s.includes('moderate') || s.includes('medium')) return 'moderada';
  if (s.includes('minor') || s.includes('low')) return 'baixa';
  return sevRaw || 'moderada';
}

function parseRssItems(xml) {
  const items = [];
  const blocks = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    items.push({
      title: stripTags(pickTag(b, 'title') || ''),
      description: pickTag(b, 'description') || '',
      link: (pickTag(b, 'link') || '').trim(),
      pubDate: pickTag(b, 'pubDate')
    });
  }
  return items;
}

async function enrichRssItemWithCap(item) {
  const link = item.link || '';
  if (!/^https?:\/\//i.test(link)) return item;
  try {
    const xml = await fetchTextAbsolute(link, 'application/cap+xml,application/xml,text/xml,*/*');
    const event = pickTag(xml, 'event');
    const severity = pickTag(xml, 'severity');
    const onset = pickTag(xml, 'onset');
    const expires = pickTag(xml, 'expires');
    const instruction = pickTag(xml, 'instruction');
    const polygon = pickTag(xml, 'polygon');
    const areaDesc = pickTag(xml, 'areaDesc');
    return {
      ...item,
      cap: {
        event,
        severity,
        onset,
        expires,
        instruction,
        polygon,
        areaDesc
      }
    };
  } catch (_) {
    return item;
  }
}

function normalizeRssAndCapToAlertItems(items) {
  return items.map((it, idx) => {
    const cap = it.cap || {};
    const title = cap.event || it.title || 'Aviso meteorológico';
    const description = stripTags(cap.areaDesc || it.description || '');
    const recommendation = stripTags(cap.instruction || '');
    const validFrom = dateOnly(cap.onset || it.pubDate) || fmtDateOnlyBr(new Date());
    const validTo = dateOnly(cap.expires || cap.onset || it.pubDate) || validFrom;
    const recommendationText = stripTags(cap.instruction || '');
    const explicitStates = normalizeStateCodes(
      it.states ||
      it.estados ||
      cap.states ||
      cap.estados ||
      it.payload?.states ||
      it.payload?.estados
    );
    const states = explicitStates.length
      ? explicitStates
      : extractUfList(`${title} ${description} ${recommendationText}`);
    const cidades = extractTocantinsCities(`${title} ${description} ${recommendationText}`);
    const cidadesFinal = cidades;
    const externalId = `${validFrom}:${title}:${idx}`.slice(0, 120);
    return {
      id: externalId,
      titulo: title,
      descricao: [description, recommendation].filter(Boolean).join(' ').slice(0, 1600),
      severidade: severityToPt(cap.severity || ''),
      vigenciaInicio: validFrom,
      vigenciaFim: validTo,
      estados: states,
      cidades: cidadesFinal,
      payload: {
        source: 'inmet-alert-rss-cap-adapter',
        link: it.link || null,
        pubDate: it.pubDate || null,
        explicitStates,
        cities: cidadesFinal,
        cap: cap || null
      }
    };
  });
}

async function fetchAndNormalizeInmetAlerts() {
  const rssUrl = getInmetAlertRssUrl();
  const xml = await fetchTextAbsolute(rssUrl, 'application/rss+xml,application/xml,text/xml,*/*');
  const rssItems = parseRssItems(xml);

  const enriched = [];
  const maxItems = Number(process.env.INMET_ADAPTER_ALERT_MAX_ITEMS || 40);
  for (const it of rssItems.slice(0, maxItems)) {
    // Sequencial para reduzir chance de bloqueio no host.
    // Em caso de falha no CAP, mantém dados do RSS.
    // eslint-disable-next-line no-await-in-loop
    enriched.push(await enrichRssItemWithCap(it));
  }

  return {
    generatedAt: new Date().toISOString(),
    items: normalizeRssAndCapToAlertItems(enriched)
  };
}

module.exports = {
  parseStationCodes,
  fmtDateOnlyBr,
  buildFeatureCollectionFromApitempo,
  fetchAndNormalizeInmetAlerts,
  extractUfList,
  reconcileAlertStates
};
