/**
 * Modelo estruturado do relatório: os mesmos dados que antes viravam só texto, agora em números.
 * Daqui saem os destaques, os gráficos, a "leitura dos dados", a planilha .xlsx e o CSV.
 */

export type ReportKind = 'clima' | 'produtividade' | 'comparativo';

export type MonthlyClimate = {
  /** AAAA-MM */
  ym: string;
  label: string;
  days: number;
  temperature: number | null;
  rainfall: number | null;
  humidity: number | null;
  wind: number | null;
};

export type ProductivityRecord = {
  year: number | null;
  crop: string;
  value: number | null;
  place: string;
};

export type MonthlyProductivity = {
  ym: string;
  label: string;
  records: number;
  average: number | null;
};

export type SeasonRow = {
  month: string;
  label: string;
  rainfall: number | null;
  temperature: number | null;
  humidity: number | null;
  productivity: number | null;
};

export type ReportModel = {
  kind: ReportKind;
  stateLabel: string;
  startDate: string;
  endDate: string;
  season?: string;
  climate: MonthlyClimate[] | null;
  productivity: ProductivityRecord[];
  monthlyProductivity: MonthlyProductivity[];
  seasonRows: SeasonRow[] | null;
};

export type Kpi = { label: string; value: string; hint?: string };

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function emptyReportModel(kind: ReportKind, stateLabel: string, startDate: string, endDate: string): ReportModel {
  return { kind, stateLabel, startDate, endDate, climate: null, productivity: [], monthlyProductivity: [], seasonRows: null };
}

function vals(list: Array<number | null | undefined>): number[] {
  return list.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

function avg(list: number[]): number | null {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "2026-03" → "Mar/26" */
export function shortMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${MONTH_ABBR[parseInt(m[2], 10) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

export function monthNameOf(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  const name = m ? MONTH_NAMES[parseInt(m[2], 10) - 1] : '';
  return name ? `${name}/${m![1]}` : ym;
}

export type ClimateTotals = {
  monthsWithData: number;
  avgTemperature: number | null;
  totalRainfall: number | null;
  avgHumidity: number | null;
  avgWind: number | null;
  rainiest: MonthlyClimate | null;
  driest: MonthlyClimate | null;
};

export function climateTotals(climate: MonthlyClimate[] | null): ClimateTotals {
  const months = (climate ?? []).filter((m) => m.days > 0);
  const rain = months.filter((m) => m.rainfall != null);
  return {
    monthsWithData: months.length,
    avgTemperature: avg(vals(months.map((m) => m.temperature))),
    totalRainfall: rain.length ? sum(rain.map((m) => m.rainfall as number)) : null,
    avgHumidity: avg(vals(months.map((m) => m.humidity))),
    avgWind: avg(vals(months.map((m) => m.wind))),
    rainiest: rain.length ? rain.reduce((a, b) => ((b.rainfall as number) > (a.rainfall as number) ? b : a)) : null,
    driest: rain.length ? rain.reduce((a, b) => ((b.rainfall as number) < (a.rainfall as number) ? b : a)) : null,
  };
}

export type YearAverage = { year: number; average: number; records: number };

/** Produtividade média (t/ha) por ano, entre os registros com valor. */
export function productivityByYear(records: ProductivityRecord[], crop?: string): YearAverage[] {
  const byYear = new Map<number, number[]>();
  for (const r of records) {
    if (r.year == null || r.value == null || !Number.isFinite(r.value) || r.value <= 0) continue;
    if (crop && r.crop !== crop) continue;
    byYear.set(r.year, [...(byYear.get(r.year) ?? []), r.value]);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => ({ year, average: avg(list) as number, records: list.length }));
}

export type CropAverage = { crop: string; average: number; records: number };

export function productivityByCrop(records: ProductivityRecord[]): CropAverage[] {
  const byCrop = new Map<string, number[]>();
  for (const r of records) {
    if (r.value == null || !Number.isFinite(r.value) || r.value <= 0) continue;
    byCrop.set(r.crop, [...(byCrop.get(r.crop) ?? []), r.value]);
  }
  return [...byCrop.entries()]
    .map(([crop, list]) => ({ crop, average: avg(list) as number, records: list.length }))
    .sort((a, b) => b.average - a.average);
}

/** Culturas que o produtor mais procura; entram primeiro como "cultura principal" dos gráficos. */
const PREFERRED_CROPS = ['soja', 'milho', 'trigo', 'arroz', 'feij', 'algod', 'sorgo', 'cana', 'caf'];

/**
 * Cultura que representa o estado nos gráficos: a primeira da lista de preferidas que tenha produção;
 * se nenhuma tiver, a de mais registros. Produtividade zero (sem área colhida) não conta.
 */
export function mainCrop(records: ProductivityRecord[]): string | null {
  const byCrop = productivityByCrop(records);
  if (!byCrop.length) return null;
  for (const key of PREFERRED_CROPS) {
    const found = byCrop.filter((c) => c.crop.toLowerCase().includes(key));
    if (found.length) return found.reduce((a, b) => (b.records > a.records ? b : a)).crop;
  }
  return byCrop.reduce((a, b) => (b.records > a.records ? b : a)).crop;
}

/** Soma de chuva por ano civil apenas dos anos com os 12 meses com dados (evita comparar ano incompleto). */
export function rainfallByFullYear(climate: MonthlyClimate[] | null): Array<{ year: number; rainfall: number }> {
  const byYear = new Map<number, MonthlyClimate[]>();
  for (const m of climate ?? []) {
    if (m.days <= 0 || m.rainfall == null) continue;
    const y = parseInt(m.ym.slice(0, 4), 10);
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  return [...byYear.entries()]
    .filter(([, list]) => list.length === 12)
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => ({ year, rainfall: sum(list.map((m) => m.rainfall as number)) }));
}

/** Média de chuva por mês do calendário (jan a dez), entre os anos disponíveis. */
export function rainfallByCalendarMonth(climate: MonthlyClimate[] | null): Array<number | null> {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const m of climate ?? []) {
    if (m.days <= 0 || m.rainfall == null) continue;
    buckets[parseInt(m.ym.slice(5, 7), 10) - 1].push(m.rainfall);
  }
  return buckets.map((b) => avg(b));
}

/** Sequência circular de 5 meses do calendário com mais chuva. */
export function wettestSeason(calendar: Array<number | null>): { start: number; end: number; share: number } | null {
  const total = sum(vals(calendar));
  if (!(total > 0) || vals(calendar).length < 12) return null;
  let best = { start: 0, share: -1 };
  for (let s = 0; s < 12; s += 1) {
    let acc = 0;
    for (let k = 0; k < 5; k += 1) acc += (calendar[(s + k) % 12] as number) ?? 0;
    if (acc / total > best.share) best = { start: s, share: acc / total };
  }
  return { start: best.start, end: (best.start + 4) % 12, share: best.share };
}

export function sampleCorrelation(pairs: Array<{ x: number; y: number }>): number | null {
  if (pairs.length < 3) return null;
  const mx = sum(pairs.map((p) => p.x)) / pairs.length;
  const my = sum(pairs.map((p) => p.y)) / pairs.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const p of pairs) {
    num += (p.x - mx) * (p.y - my);
    dx += (p.x - mx) ** 2;
    dy += (p.y - my) ** 2;
  }
  if (dx <= 0 || dy <= 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Números em destaque no topo do relatório. */
export function buildKpis(model: ReportModel): Kpi[] {
  const out: Kpi[] = [];
  const t = climateTotals(model.climate);
  if (t.monthsWithData > 0 && model.kind !== 'produtividade') {
    out.push({ label: 'Temperatura média', value: `${formatNumber(t.avgTemperature, 1)} °C`, hint: `${t.monthsWithData} meses com dados` });
    out.push({
      label: 'Chuva acumulada',
      value: `${formatNumber(t.totalRainfall, 0)} mm`,
      hint: t.totalRainfall != null ? `média de ${formatNumber(t.totalRainfall / t.monthsWithData, 0)} mm por mês` : undefined,
    });
    if (t.rainiest) out.push({ label: 'Mês mais chuvoso', value: shortMonthLabel(t.rainiest.ym), hint: `${formatNumber(t.rainiest.rainfall, 0)} mm` });
    if (t.driest) out.push({ label: 'Mês mais seco', value: shortMonthLabel(t.driest.ym), hint: `${formatNumber(t.driest.rainfall, 0)} mm` });
  }
  if (model.productivity.length > 0 && model.kind !== 'clima') {
    const crop = mainCrop(model.productivity);
    const years = productivityByYear(model.productivity, crop ?? undefined);
    const overall = avg(years.map((y) => y.average));
    if (overall != null) out.push({ label: crop ? `Produtividade média (${crop})` : 'Produtividade média', value: `${formatNumber(overall, 2)} t/ha`, hint: `${years.length} ano(s)` });
    const best = years.length ? years.reduce((a, b) => (b.average > a.average ? b : a)) : null;
    if (best && years.length > 1) out.push({ label: 'Melhor ano', value: String(best.year), hint: `${formatNumber(best.average, 2)} t/ha` });
    out.push({ label: 'Registros de produtividade', value: String(model.productivity.length), hint: `${productivityByCrop(model.productivity).length} cultura(s)` });
  }
  return out.slice(0, 4);
}

/** Frases geradas por regras simples sobre os números (sem IA, sem inventar). */
export function buildInsights(model: ReportModel): string[] {
  const out: string[] = [];
  const calendar = rainfallByCalendarMonth(model.climate);
  const wet = wettestSeason(calendar);
  if (wet) {
    out.push(
      `A chuva se concentra de ${MONTH_NAMES[wet.start]} a ${MONTH_NAMES[wet.end]}, com ${formatNumber(wet.share * 100, 0)}% do total do período.`
    );
    const dry = calendar.map((v, i) => ({ v, i })).filter((x) => x.v != null && (x.v as number) < 20);
    if (dry.length >= 2) {
      out.push(`${dry.length} meses do calendário ficam, em média, abaixo de 20 mm: ${dry.map((d) => MONTH_NAMES[d.i]).join(', ')}.`);
    }
  }
  const years = rainfallByFullYear(model.climate);
  if (years.length >= 2) {
    const a = years[years.length - 2];
    const b = years[years.length - 1];
    if (a.rainfall > 0) {
      const diff = ((b.rainfall - a.rainfall) / a.rainfall) * 100;
      if (Math.abs(diff) >= 1) {
        out.push(`${b.year} teve ${formatNumber(Math.abs(diff), 0)}% ${diff > 0 ? 'mais' : 'menos'} chuva que ${a.year} (${formatNumber(b.rainfall, 0)} mm contra ${formatNumber(a.rainfall, 0)} mm).`);
      }
    }
  }
  const crop = mainCrop(model.productivity);
  const prod = productivityByYear(model.productivity, crop ?? undefined);
  if (crop && prod.length >= 2) {
    const best = prod.reduce((a, b) => (b.average > a.average ? b : a));
    const worst = prod.reduce((a, b) => (b.average < a.average ? b : a));
    out.push(`Para ${crop}, o melhor ano foi ${best.year} (${formatNumber(best.average, 2)} t/ha) e o menor, ${worst.year} (${formatNumber(worst.average, 2)} t/ha).`);
  }
  if (model.kind === 'comparativo') {
    const pairs: Array<{ x: number; y: number }> = [];
    const prodByMonth = new Map(model.monthlyProductivity.map((m) => [m.ym, m.average] as const));
    for (const m of model.climate ?? []) {
      const p = prodByMonth.get(m.ym);
      if (m.rainfall != null && p != null) pairs.push({ x: m.rainfall, y: p });
    }
    const r = sampleCorrelation(pairs);
    if (r != null && pairs.length >= 6) {
      out.push(`Indicador exploratório: a correlação entre a chuva mensal e a produtividade do mês é r = ${formatNumber(r, 2)} (${pairs.length} meses). Não indica causa.`);
    }
  }
  return out;
}

export function periodLabel(model: Pick<ReportModel, 'startDate' | 'endDate' | 'season'>): string {
  if (model.season) return `Safra ${model.season}`;
  const a = model.startDate.slice(0, 4);
  const b = model.endDate.slice(0, 4);
  return a === b ? a : `${a} a ${b}`;
}
