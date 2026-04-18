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
    { color: '#ea580c', label: '< 3.0 t/ha' },
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

export function fillColorForMetric(metric: BrazilMapMetric, value: number | null): string {
  if (value == null || Number.isNaN(value)) return COLOR_NO_DATA;
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
