import type { DashboardRegionRowDto } from '../../../lib/api/contracts/climate';

export type BrazilMapMetric = 'temperatura' | 'umidade' | 'precipitacao' | 'vento' | 'produtividade';

export type LegendItem = { color: string; label: string };

export const LEGEND_BY_METRIC: Record<BrazilMapMetric, LegendItem[]> = {
  temperatura: [
    { color: '#1e3a8a', label: '< 15°C' },
    { color: '#2563eb', label: '15–20°C' },
    { color: '#60a5fa', label: '20–25°C' },
    { color: '#fb923c', label: '25–30°C' },
    { color: '#dc2626', label: '> 30°C' },
  ],
  umidade: [
    { color: '#fef3c7', label: '< 40%' },
    { color: '#fde68a', label: '40–55%' },
    { color: '#93c5fd', label: '55–70%' },
    { color: '#3b82f6', label: '70–85%' },
    { color: '#1e40af', label: '> 85%' },
  ],
  precipitacao: [
    { color: '#f0f9ff', label: '0–5 mm' },
    { color: '#a5f3fc', label: '5–15 mm' },
    { color: '#22d3ee', label: '15–40 mm' },
    { color: '#0891b2', label: '40–80 mm' },
    { color: '#164e63', label: '> 80 mm' },
  ],
  vento: [
    { color: '#ecfdf5', label: '0–15 km/h' },
    { color: '#a7f3d0', label: '15–30 km/h' },
    { color: '#34d399', label: '30–50 km/h' },
    { color: '#059669', label: '50–70 km/h' },
    { color: '#14532d', label: '> 70 km/h' },
  ],
  produtividade: [
    { color: '#9ca3b8', label: '0 t/ha' },
    { color: '#ea580c', label: '> 0 e < 3.0 t/ha' },
    { color: '#eab308', label: '3.0–3.5 t/ha' },
    { color: '#84cc16', label: '3.5–4.0 t/ha' },
    { color: '#16a34a', label: '4.0–4.5 t/ha' },
    { color: '#14532d', label: '> 4.5 t/ha' },
  ],
};

const COLOR_SCALE_TEMP = ['#1e3a8a', '#2563eb', '#60a5fa', '#fb923c', '#dc2626'];
const COLOR_SCALE_HUM = ['#fef3c7', '#fde68a', '#93c5fd', '#3b82f6', '#1e40af'];
const COLOR_SCALE_PRECIP = ['#f0f9ff', '#a5f3fc', '#22d3ee', '#0891b2', '#164e63'];
const COLOR_SCALE_WIND = ['#ecfdf5', '#a7f3d0', '#34d399', '#059669', '#14532d'];
const COLOR_SCALE_PROD = ['#ea580c', '#eab308', '#84cc16', '#16a34a', '#14532d'];

export function bucketIndexForMetric(metric: BrazilMapMetric, value: number): number {
  switch (metric) {
    case 'temperatura':
      if (value < 15) return 0;
      if (value < 20) return 1;
      if (value < 25) return 2;
      if (value < 30) return 3;
      return 4;
    case 'umidade':
      if (value < 40) return 0;
      if (value < 55) return 1;
      if (value < 70) return 2;
      if (value < 85) return 3;
      return 4;
    case 'precipitacao':
      if (value < 5) return 0;
      if (value < 15) return 1;
      if (value < 40) return 2;
      if (value < 80) return 3;
      return 4;
    case 'vento':
      if (value < 15) return 0;
      if (value < 30) return 1;
      if (value < 50) return 2;
      if (value < 70) return 3;
      return 4;
    case 'produtividade':
      if (value < 3) return 0;
      if (value < 3.5) return 1;
      if (value < 4) return 2;
      if (value < 4.5) return 3;
      return 4;
    default:
      return 2;
  }
}

const COLOR_NO_DATA = '#cbd5e1';
/** Produtividade nula na série (SIDRA / sem área colhida) — distinto de «sem dado» na malha. */
const COLOR_PROD_ZERO = '#9ca3b8';

function numFromUnknown(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Texto do popup / legenda contextual para o valor numérico do indicador. */
export function formatPopupValueForMetric(metric: BrazilMapMetric, value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    switch (metric) {
      case 'temperatura':
        return 'Sem dado de temperatura';
      case 'umidade':
        return 'Sem dado de umidade';
      case 'precipitacao':
        return 'Sem dado de precipitação';
      case 'vento':
        return 'Sem dado de vento';
      case 'produtividade':
        return 'Sem dado de produtividade';
      default:
        return 'Sem dado';
    }
  }
  switch (metric) {
    case 'temperatura':
      return `${value.toFixed(1)}°C`;
    case 'umidade':
      return `${Math.round(value)}%`;
    case 'precipitacao':
      return `${value.toFixed(0)} mm`;
    case 'vento':
      return `${value.toFixed(0)} km/h`;
    case 'produtividade':
      if (value === 0) return '0.00 t/ha (valor nulo na série)';
      return `${value.toFixed(2)} t/ha`;
    default:
      return String(value);
  }
}

export function fillColorForMetric(metric: BrazilMapMetric, value: number | null): string {
  if (value == null || Number.isNaN(value)) return COLOR_NO_DATA;
  if (metric === 'produtividade' && value === 0) return COLOR_PROD_ZERO;
  const i = bucketIndexForMetric(metric, value);
  const scales: Record<BrazilMapMetric, string[]> = {
    temperatura: COLOR_SCALE_TEMP,
    umidade: COLOR_SCALE_HUM,
    precipitacao: COLOR_SCALE_PRECIP,
    vento: COLOR_SCALE_WIND,
    produtividade: COLOR_SCALE_PROD,
  };
  return scales[metric][i] ?? COLOR_NO_DATA;
}

function getUfFromFeature(feature: { properties?: Record<string, unknown> }): string {
  const p = feature?.properties;
  if (!p) return '';
  const raw = (p.state ?? p.sigla ?? p.UF ?? p.uf) as string | undefined;
  return String(raw || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

/** Valor vindo só do dashboard (`valuesByUf`). Sem dado = null (cor neutra no mapa). */
export function resolveValueForFeature(
  _metric: BrazilMapMetric,
  feature: { properties?: Record<string, unknown> },
  valuesByUf: Partial<Record<string, number>> | undefined
): number | null {
  const uf = getUfFromFeature(feature);
  if (uf && valuesByUf && valuesByUf[uf] != null && !Number.isNaN(Number(valuesByUf[uf]))) {
    return Number(valuesByUf[uf]);
  }
  return null;
}

/** Média de produtividade (t/ha) por UF a partir das linhas da API `/productivity`. */
/** Código IBGE do município (7 dígitos), sem caracteres não numéricos. */
export function normalizeIbgeMunicipioCode(raw: string | number | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(0, 7) : d;
}

/**
 * Mapa coroplético por município: chave = `codarea` da malha IBGE (7 dígitos).
 * Ignora linhas sem `ibgeCode` ou com `geoData.category` diferente de `municipality`.
 */
/**
 * Agrega registros climáticos diários por município (`codarea` IBGE).
 * Precipitação: soma no período; demais métricas: média aritmética.
 */
export function buildClimateMetricByIbgeCodarea(
  rows: Array<{
    avgTemperature?: unknown;
    humidity?: unknown;
    windSpeed?: unknown;
    precipitation?: unknown;
    geoData?: { ibgeCode?: string | null; name?: string | null; category?: string | null } | null;
  }>,
  metric: BrazilMapMetric
): { valuesByCodarea: Record<string, number>; nameByCodarea: Record<string, string> } {
  if (metric === 'produtividade') {
    return { valuesByCodarea: {}, nameByCodarea: {} };
  }
  const buckets: Record<string, number[]> = {};
  const nameByCodarea: Record<string, string> = {};
  for (const row of rows) {
    const cat = row.geoData?.category;
    if (cat && cat !== 'municipality') continue;
    const code = normalizeIbgeMunicipioCode(row.geoData?.ibgeCode ?? undefined);
    if (!code || code.length < 7) continue;

    let v: number | null = null;
    switch (metric) {
      case 'temperatura':
        v = numFromUnknown(row.avgTemperature);
        break;
      case 'umidade':
        v = numFromUnknown(row.humidity);
        break;
      case 'vento':
        v = numFromUnknown(row.windSpeed);
        break;
      case 'precipitacao':
        v = numFromUnknown(row.precipitation);
        break;
      default:
        break;
    }
    if (v == null) continue;
    if (!buckets[code]) buckets[code] = [];
    buckets[code].push(v);
    const nm = row.geoData?.name?.trim();
    if (nm) nameByCodarea[code] = nm;
  }
  const valuesByCodarea: Record<string, number> = {};
  for (const [code, arr] of Object.entries(buckets)) {
    if (!arr.length) continue;
    valuesByCodarea[code] =
      metric === 'precipitacao' ? arr.reduce((a, x) => a + x, 0) : arr.reduce((a, x) => a + x, 0) / arr.length;
  }
  return { valuesByCodarea, nameByCodarea };
}

export function buildProductivityByIbgeCodarea(
  rows: Array<{
    productivity?: string | number | null;
    municipalityIbgeCode?: string | null;
    municipalityName?: string | null;
    geoData?: { ibgeCode?: string | null; name?: string | null; category?: string | null } | null;
  }>
): { valuesByCodarea: Record<string, number>; nameByCodarea: Record<string, string> } {
  const buckets: Record<string, number[]> = {};
  const nameByCodarea: Record<string, string> = {};
  for (const row of rows) {
    const cat = row.geoData?.category;
    if (cat && cat !== 'municipality') continue;
    const code = normalizeIbgeMunicipioCode(
      row.municipalityIbgeCode ?? row.geoData?.ibgeCode ?? undefined
    );
    if (!code || code.length < 7) continue;
    const v = Number(row.productivity);
    if (!Number.isFinite(v)) continue;
    if (!buckets[code]) buckets[code] = [];
    buckets[code].push(v);
    const nm =
      row.municipalityName?.trim() || row.geoData?.name?.trim();
    if (nm) nameByCodarea[code] = nm;
  }
  const valuesByCodarea: Record<string, number> = {};
  for (const [code, arr] of Object.entries(buckets)) {
    if (!arr.length) continue;
    valuesByCodarea[code] = arr.reduce((a, x) => a + x, 0) / arr.length;
  }
  return { valuesByCodarea, nameByCodarea };
}

export function buildValuesByUfFromProductivityRows(
  rows: Array<{
    productivity?: string | number | null;
    state?: string | null;
    geoData?: { state?: string | null } | null;
  }>
): Partial<Record<string, number>> {
  const buckets: Record<string, number[]> = {};
  for (const row of rows) {
    const uf = String(row.state || row.geoData?.state || '')
      .trim()
      .toUpperCase()
      .slice(0, 2);
    if (!uf || uf.length !== 2) continue;
    const v = Number(row.productivity);
    if (!Number.isFinite(v)) continue;
    if (!buckets[uf]) buckets[uf] = [];
    buckets[uf].push(v);
  }
  const out: Partial<Record<string, number>> = {};
  for (const [uf, arr] of Object.entries(buckets)) {
    if (!arr.length) continue;
    out[uf] = arr.reduce((a, x) => a + x, 0) / arr.length;
  }
  return out;
}

export function buildValuesByUfFromDashboard(
  regioes: DashboardRegionRowDto[],
  metric: BrazilMapMetric
): Partial<Record<string, number>> {
  const buckets: Record<string, number[]> = {};
  for (const r of regioes) {
    const uf = r.uf?.toUpperCase().slice(0, 2);
    if (!uf) continue;
    let v: number | null | undefined;
    switch (metric) {
      case 'temperatura':
        v = r.temperaturaNum ?? null;
        break;
      case 'umidade':
        v = r.umidadeNum ?? null;
        break;
      case 'precipitacao':
        v = r.precipitacaoNum ?? null;
        break;
      case 'vento':
        v = r.ventoNum ?? null;
        break;
      case 'produtividade':
        v = r.produtividadeNum ?? null;
        break;
      default:
        v = null;
    }
    if (v == null || Number.isNaN(Number(v))) continue;
    if (!buckets[uf]) buckets[uf] = [];
    buckets[uf].push(Number(v));
  }
  const out: Partial<Record<string, number>> = {};
  for (const [uf, arr] of Object.entries(buckets)) {
    if (!arr.length) continue;
    out[uf] = arr.reduce((a, x) => a + x, 0) / arr.length;
  }
  return out;
}
