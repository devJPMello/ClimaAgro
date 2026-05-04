import { listAllClimateRecordsInRange, type ClimateListResponse } from '../api/climateApi';
import {
  getClimateVsProductivity,
  listAllProductivityForYear,
  type ProductivityListResponse,
} from '../api/productivityApi';
import { labelForProductivityCropType } from '../filters/appFilters';
import { formatUfLabel, UF_NOME } from '../geo/brazilStatesMalha';
import { REPORT_EXPORT_UF, TOCANTINS_CITY_VALUE_TO_NAME } from '../geo/tocantinsCities';

/** Ano civil a partir de `YYYY-MM-DD` sem usar `Date` em UTC (evita 2025-01-01 → getFullYear() === 2024 em BRT). */
function isoDateParts(isoYmd: string): { year: number; month: number; day: number } | null {
  const s = String(isoYmd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const year = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(5, 7), 10);
  const day = parseInt(s.slice(8, 10), 10);
  if (![year, month, day].every((x) => Number.isFinite(x))) return null;
  return { year, month, day };
}

function normalizeReportUf(localidadeKey: string): string {
  const u = String(localidadeKey || '').trim().toUpperCase();
  if (u.length === 2 && UF_NOME[u]) return u;
  return REPORT_EXPORT_UF;
}

export type ReportTipoKey = 'clima' | 'produtividade' | 'comparativo';

/** Nome do município como em `geo_data.name` (ex.: Palmas). Aceita chave legada (`palmas`) ou nome oficial IBGE. */
export function climatePlaceFromUi(localidadeKey: string, displayLocal?: string): string {
  const byKey = TOCANTINS_CITY_VALUE_TO_NAME[localidadeKey as keyof typeof TOCANTINS_CITY_VALUE_TO_NAME];
  if (byKey) return byKey;
  const stripped = (displayLocal || localidadeKey || '')
    .replace(/\s*—\s*Tocantins\s*\(TO\)\s*$/i, '')
    .replace(/\s*-\s*TO\s*$/i, '')
    .trim();
  return stripped || 'Palmas';
}

export function reportTipoFromStoredLabel(tipo: string): ReportTipoKey {
  const t = tipo.toLowerCase();
  if (t.includes('produtividade')) return 'produtividade';
  if (t.includes('comparativo')) return 'comparativo';
  return 'clima';
}

export function localidadeKeyFromStoredLocal(localLabel: string): string {
  const trimmed = localLabel.trim();
  const paren = /\(([A-Za-z]{2})\)\s*$/i.exec(trimmed);
  if (paren) {
    const s = paren[1].toUpperCase();
    if (UF_NOME[s]) return s;
  }
  const dash = /[-–]\s*([A-Za-z]{2})\s*$/i.exec(trimmed);
  if (dash) {
    const s = dash[1].toUpperCase();
    if (UF_NOME[s]) return s;
  }
  if (trimmed.length === 2 && UF_NOME[trimmed.toUpperCase()]) return trimmed.toUpperCase();
  const normalized = localLabel.replace(/\s*-\s*TO\s*$/i, '').trim();
  const hit = Object.entries(TOCANTINS_CITY_VALUE_TO_NAME).find(([, name]) =>
    normalized.toLowerCase().startsWith(name.toLowerCase())
  );
  if (hit) return hit[0];
  return normalized || REPORT_EXPORT_UF;
}

export function parsePeriodoExport(periodo: string): { startDate: string; endDate: string } {
  const parts = periodo
    .split(/\s*[—–-]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { startDate: parts[0].slice(0, 10), endDate: parts[1].slice(0, 10) };
  }
  const end = new Date();
  const start = new Date();
  start.setUTCFullYear(end.getUTCFullYear() - 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/** Anos civis cobertos pela safra (ex.: `2024/25` → 2024–2025). */
export function parseSeasonToCalendarBounds(raw: string): { start: number; end: number } | null {
  const s = String(raw).trim();
  if (!s) return null;
  const full = /^(\d{4})\/(\d{4})$/.exec(s);
  if (full) {
    const y1 = parseInt(full[1], 10);
    const y2 = parseInt(full[2], 10);
    if (Number.isFinite(y1) && Number.isFinite(y2) && y2 >= y1 && y2 - y1 <= 3) return { start: y1, end: y2 };
    return null;
  }
  const short = /^(\d{4})\/(\d{2})$/.exec(s);
  if (short) {
    const y1 = parseInt(short[1], 10);
    const d2 = parseInt(short[2], 10);
    if (!Number.isFinite(y1) || !Number.isFinite(d2)) return null;
    if (d2 === (y1 + 1) % 100) return { start: y1, end: y1 + 1 };
    const yGuess = 2000 + d2;
    if (yGuess > y1 && yGuess <= y1 + 2) return { start: y1, end: yGuess };
    return { start: y1, end: y1 + 1 };
  }
  const yOnly = /^(\d{4})$/.exec(s);
  if (yOnly) {
    const y = parseInt(yOnly[1], 10);
    return Number.isFinite(y) ? { start: y, end: y } : null;
  }
  return null;
}

/** Ano base da safra (ex.: `2024/25` -> 2024). */
export function parseSeasonBaseYear(raw: string): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  const full = /^(\d{4})\/(\d{2}|\d{4})$/.exec(s);
  if (full) return parseInt(full[1], 10);
  const short = /^(\d{2})\/(\d{2})$/.exec(s);
  if (short) return 2000 + parseInt(short[1], 10);
  return null;
}

/**
 * Histórico gravado como `Safra 2024/25` (produtividade) ou `AAAA-MM-DD — AAAA-MM-DD`.
 */
export function parseExportPeriodoLabel(periodo: string): {
  startDate: string;
  endDate: string;
  productivitySeason?: string;
} {
  const trimmed = periodo.trim();
  const anosM = /^Anos\s+(\d{4})\s*[—–-]\s*(\d{4})$/i.exec(trimmed);
  if (anosM) {
    const y0 = parseInt(anosM[1], 10);
    const y1 = parseInt(anosM[2], 10);
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    return {
      startDate: `${lo}-01-01`,
      endDate: `${hi}-12-31`,
    };
  }
  const safraM = /^Safra\s+(\d{4}\/\d{2})(?:\s+\(clima\s+(\d{4})\))?$/i.exec(trimmed);
  if (safraM) {
    const season = safraM[1];
    const climateBaseYear = safraM[2] ? parseInt(safraM[2], 10) : null;
    if (climateBaseYear) {
      return {
        startDate: `${climateBaseYear}-01-01`,
        endDate: `${climateBaseYear}-12-31`,
        productivitySeason: season,
      };
    }
    const bounds = parseSeasonToCalendarBounds(season);
    if (bounds) {
      return {
        startDate: `${bounds.start}-01-01`,
        endDate: `${bounds.end}-12-31`,
        productivitySeason: season,
      };
    }
  }
  const { startDate, endDate } = parsePeriodoExport(periodo);
  return { startDate, endDate };
}

function n(v: unknown): number | null {
  if (v == null || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

type ClimateMonthAcc = { days: number; temps: number[]; precs: number[]; hums: number[]; winds: number[] };

export type ClimateMonthlySeries = {
  sorted: ClimateListResponse['data'];
  monthKeys: string[];
  byMonth: Map<string, ClimateMonthAcc>;
  /** Linhas de resumo do período (UF, totais globais) — sem tabela mensal. */
  summaryLines: string[];
};

/** Agrega clima diário por mês civil e totais do intervalo (reutilizado no comparativo). */
function climateMonthlySeriesFromRows(
  rows: ClimateListResponse['data'],
  place: string,
  rangeStartYmd: string,
  rangeEndYmd: string
): ClimateMonthlySeries | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let sumP = 0;
  let nP = 0;
  let sumT = 0;
  let nT = 0;
  let sumH = 0;
  let nH = 0;
  let sumW = 0;
  let nW = 0;
  for (const r of sorted) {
    const p = n(r.precipitation);
    if (p != null) {
      sumP += p;
      nP += 1;
    }
    const t = temperatureFromClimateRow(r);
    if (t != null) {
      sumT += t;
      nT += 1;
    }
    const h = n(r.humidity);
    if (h != null) {
      sumH += h;
      nH += 1;
    }
    const w = n(r.windSpeed);
    if (w != null) {
      sumW += w;
      nW += 1;
    }
  }

  const byMonth = new Map<string, ClimateMonthAcc>();
  for (const r of sorted) {
    const d = String(r.date).slice(0, 10);
    const key = d.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    let acc = byMonth.get(key);
    if (!acc) {
      acc = { days: 0, temps: [], precs: [], hums: [], winds: [] };
      byMonth.set(key, acc);
    }
    acc.days += 1;
    const t = temperatureFromClimateRow(r);
    if (t != null) acc.temps.push(t);
    const p = n(r.precipitation);
    if (p != null) acc.precs.push(p);
    const h = n(r.humidity);
    if (h != null) acc.hums.push(h);
    const w = n(r.windSpeed);
    if (w != null) acc.winds.push(w);
  }

  let monthKeys = monthKeysBetweenInclusive(rangeStartYmd, rangeEndYmd);
  if (monthKeys.length === 0) {
    monthKeys = Array.from(byMonth.keys()).sort();
  }

  const summaryLines = [
    `UF (filtro): ${formatUfLabel(place)}`,
    `Registos diários: ${sorted.length}`,
    nT ? `Temperatura média (média das médias diárias): ${(sumT / nT).toFixed(1)} °C` : 'Temperatura média: —',
    nP ? `Precipitação acumulada (soma dos dias): ${sumP.toFixed(1)} mm` : 'Precipitação: —',
    nH ? `Umidade média: ${(sumH / nH).toFixed(0)} %` : 'Umidade: —',
    nW ? `Velocidade média do vento: ${(sumW / nW).toFixed(1)} km/h` : 'Vento: —',
  ];

  return { sorted, monthKeys, byMonth, summaryLines };
}

/** Igual à série temporal: média ou (máx+mín)/2 quando CPTEC não envia média. */
function temperatureFromClimateRow(r: ClimateListResponse['data'][number]): number | null {
  const avg = n(r.avgTemperature);
  if (avg != null) return avg;
  const maxT = n((r as { maxTemperature?: unknown }).maxTemperature);
  const minT = n((r as { minTemperature?: unknown }).minTemperature);
  if (maxT != null && minT != null) return (maxT + minT) / 2;
  if (maxT != null) return maxT;
  if (minT != null) return minT;
  return null;
}

/** Chaves YYYY-MM de cada mês civil entre as datas (YYYY-MM-DD), inclusive. */
function monthKeysBetweenInclusive(startYmd: string, endYmd: string): string[] {
  const s = String(startYmd).slice(0, 10);
  const e = String(endYmd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) return [];
  const y0 = parseInt(s.slice(0, 4), 10);
  const m0 = parseInt(s.slice(5, 7), 10);
  const y1 = parseInt(e.slice(0, 4), 10);
  const m1 = parseInt(e.slice(5, 7), 10);
  if (![y0, m0, y1, m1].every((x) => Number.isFinite(x))) return [];
  const keys: string[] = [];
  let y = y0;
  let m = m0;
  for (;;) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (y === y1 && m === m1) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function monthLabelPtBr(ym: string): string {
  const [ys, ms] = ym.split('-');
  const y = parseInt(ys, 10);
  const mo = parseInt(ms, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return ym;
  try {
    const raw = new Date(y, mo - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return raw.length ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
  } catch {
    return ym;
  }
}

function formatClimateBlock(
  rows: ClimateListResponse['data'],
  place: string,
  rangeStartYmd: string,
  rangeEndYmd: string
): string {
  if (!rows.length) {
    return `Sem registos diários de clima para «${place}» no intervalo pedido. Execute a sincronização de clima no servidor se a base estiver vazia.`;
  }
  const series = climateMonthlySeriesFromRows(rows, place, rangeStartYmd, rangeEndYmd);
  if (!series) {
    return `Sem registos diários de clima para «${place}» no intervalo pedido. Execute a sincronização de clima no servidor se a base estiver vazia.`;
  }
  const lines: string[] = [
    ...series.summaryLines,
    '',
    'Resumo mensal (cada linha agrega os dias com dados naquele mês civil; meses sem linha na API aparecem com traços):',
    '',
    'Mês (referência) | Mês civil | Dias c/ dados | T média °C | Chuva total mm | Umidade média % | Vento médio km/h',
  ];

  for (const ym of series.monthKeys) {
    const acc = series.byMonth.get(ym);
    const label = monthLabelPtBr(ym);
    if (!acc || acc.days === 0) {
      lines.push(`${ym} | ${label} | 0 | — | — | — | —`);
      continue;
    }
    const tM = acc.temps.length ? mean(acc.temps).toFixed(1) : '—';
    const pM = acc.precs.length ? acc.precs.reduce((a, b) => a + b, 0).toFixed(1) : '—';
    const hM = acc.hums.length ? mean(acc.hums).toFixed(0) : '—';
    const wM = acc.winds.length ? mean(acc.winds).toFixed(1) : '—';
    lines.push(`${ym} | ${label} | ${acc.days} | ${tM} | ${pM} | ${hM} | ${wM}`);
  }

  return lines.join('\n');
}

/** Comparativo com safra: uma linha por mês com clima e produtividade (valor da API). */
function formatComparativoSeasonMerged(
  rows: Array<{
    mes?: string;
    month?: string;
    climate: number | null;
    productivity: number | null;
    avgTemperature?: number | null;
    avgHumidity?: number | null;
  }>
): string {
  if (!rows.length) {
    return 'Sem dados retornados pela rota de comparativo para esta safra.';
  }
  const sorted = [...rows].sort((a, b) => String(a.month || a.mes || '').localeCompare(String(b.month || b.mes || '')));
  const totalPrecip = sorted.reduce(
    (acc, row) => acc + (Number.isFinite(Number(row.climate)) ? Number(row.climate) : 0),
    0
  );
  const tempVals = sorted.map((row) => Number(row.avgTemperature)).filter((x) => Number.isFinite(x));
  const humVals = sorted.map((row) => Number(row.avgHumidity)).filter((x) => Number.isFinite(x));
  const prodVals = sorted.map((row) => Number(row.productivity)).filter((x) => Number.isFinite(x));
  const lines: string[] = [
    `Meses retornados: ${sorted.length}`,
    `Precipitação acumulada (chuva mensal somada): ${totalPrecip.toFixed(1)} mm`,
    tempVals.length ? `Temperatura média mensal (média das médias): ${mean(tempVals).toFixed(1)} °C` : 'Temperatura média mensal: —',
    humVals.length ? `Umidade média mensal (média das médias): ${mean(humVals).toFixed(0)} %` : 'Umidade média mensal: —',
    prodVals.length
      ? `Produtividade (valor por mês na API; pode repetir a média da safra): média ${mean(prodVals).toFixed(2)} t/ha`
      : 'Produtividade: —',
    '',
    'Mês ref. | Mês | Chuva (mm) | T média (°C) | Umidade (%) | Produtividade (t/ha)',
  ];
  sorted.forEach((row) => {
    const ref =
      row.month ||
      (typeof row.mes === 'string' && /^\d{4}-\d{2}/.test(row.mes) ? row.mes.slice(0, 7) : '—');
    const mesLabel = row.mes || row.month || '—';
    const prod =
      row.productivity != null && Number.isFinite(Number(row.productivity))
        ? Number(row.productivity).toFixed(2)
        : '—';
    lines.push(
      `${ref} | ${mesLabel} | ${row.climate != null ? `${Number(row.climate).toFixed(1)}` : '—'} | ${
        row.avgTemperature != null ? `${Number(row.avgTemperature).toFixed(1)}` : '—'
      } | ${row.avgHumidity != null ? `${Number(row.avgHumidity).toFixed(0)}` : '—'} | ${prod}`
    );
  });
  return lines.join('\n');
}

/** Comparativo por anos civis: intercala colunas de clima e produtividade por mês. */
function formatMergedComparativoMonthTable(
  series: ClimateMonthlySeries | null,
  monthlyBuckets: { ym: string; rows: ProductivityListResponse['data'] }[],
  rangeStartYmd: string,
  rangeEndYmd: string
): string {
  let monthKeys = series?.monthKeys?.length
    ? series.monthKeys
    : monthKeysBetweenInclusive(String(rangeStartYmd).slice(0, 10), String(rangeEndYmd).slice(0, 10));
  if (monthKeys.length === 0) {
    monthKeys = [...new Set(monthlyBuckets.map((b) => b.ym))].sort();
  }
  const lines: string[] = [
    'Cada linha é um mês civil: clima agregado dos registos diários da UF; produtividade conforme API (period_ref / mesAno).',
    '',
    'Mês ref. | Mês | Dias clima | T média °C | Chuva mm | Umid. % | Vent. km/h | Reg. prod. | Prod. méd. t/ha | Culturas dist.',
  ];
  const prodByYm = new Map(monthlyBuckets.map((b) => [b.ym, b.rows] as const));
  for (const ym of monthKeys) {
    const label = monthLabelPtBr(ym);
    const acc = series?.byMonth.get(ym);
    let dC = '0';
    let tC = '—';
    let pC = '—';
    let hC = '—';
    let wC = '—';
    if (acc && acc.days > 0) {
      dC = String(acc.days);
      tC = acc.temps.length ? mean(acc.temps).toFixed(1) : '—';
      pC = acc.precs.length ? acc.precs.reduce((a, b) => a + b, 0).toFixed(1) : '—';
      hC = acc.hums.length ? mean(acc.hums).toFixed(0) : '—';
      wC = acc.winds.length ? mean(acc.winds).toFixed(1) : '—';
    }
    const pr = prodByYm.get(ym) ?? [];
    const vals = pr.map((r) => n(r.productivity)).filter((x): x is number => x != null);
    const meanP = vals.length ? mean(vals).toFixed(2) : '—';
    const crops = new Set(
      pr.map((r) => {
        const raw = r.productLabel || r.cropType;
        return raw ? labelForProductivityCropType(String(raw)) : '—';
      })
    );
    lines.push(
      `${ym} | ${label} | ${dC} | ${tC} | ${pC} | ${hC} | ${wC} | ${pr.length} | ${meanP} | ${pr.length ? String(crops.size) : '—'}`
    );
  }
  return lines.join('\n');
}

/** Tabela mensal: um mês civil por linha (dados com `period_ref` ou consulta `mesAno`). */
function formatProductivityMonthlyTable(
  buckets: { ym: string; rows: ProductivityListResponse['data'] }[],
  ufLabel: string
): string {
  if (buckets.length === 0) {
    return 'Intervalo de datas inválido para resumo mensal de produtividade.';
  }
  const lines: string[] = [
    `UF: ${formatUfLabel(ufLabel)}`,
    '',
    'Resumo mensal: cada linha corresponde ao mês civil (YYYY-MM). «Registos» é a contagem de linhas na base com esse period_ref; «Produtividade média» é a média aritmética dos valores t/ha nesse mês.',
    '',
    'Mês ref. | Mês | Registos | Produtividade média (t/ha) | Culturas distintas',
  ];
  for (const { ym, rows } of buckets) {
    const label = monthLabelPtBr(ym);
    if (!rows.length) {
      lines.push(`${ym} | ${label} | 0 | — | —`);
      continue;
    }
    const vals = rows.map((r) => n(r.productivity)).filter((x): x is number => x != null);
    const meanP = vals.length ? mean(vals).toFixed(2) : '—';
    const crops = new Set(
      rows.map((r) => {
        const raw = r.productLabel || r.cropType;
        return raw ? labelForProductivityCropType(String(raw)) : '—';
      })
    );
    lines.push(`${ym} | ${label} | ${rows.length} | ${meanP} | ${crops.size}`);
  }
  lines.push(
    '',
    'Nota: registos só anuais (sem period_ref mensal) aparecem no bloco «Detalhe por registo»; aqui só entram linhas mensais ou o resultado da busca por mesAno na API.'
  );
  return lines.join('\n');
}

function formatProductivityBlock(perYear: ProductivityListResponse['data'][], ufLabel: string): string {
  const flat = perYear.flat();
  const use = flat;
  if (!use.length) {
    return `Sem registos de produtividade para a UF ${formatUfLabel(ufLabel)} no período de anos consultado.`;
  }
  const head = `Registos da UF «${formatUfLabel(ufLabel)}»: ${use.length}.`;
  const lines = [head, '', 'Produto / cultura | Ano | Produtividade (t/ha)'];
  const sorted = [...use].sort((a, b) => {
    const cp = labelForProductivityCropType(String(a.productLabel || a.cropType || '')).localeCompare(
      labelForProductivityCropType(String(b.productLabel || b.cropType || '')),
      'pt-BR'
    );
    if (cp !== 0) return cp;
    return (a.year || 0) - (b.year || 0);
  });
  sorted.forEach((r) => {
    const p = n(r.productivity);
    const raw = r.productLabel || r.cropType;
    const cult = raw ? labelForProductivityCropType(String(raw)) : '—';
    lines.push(
      `${cult} | ${r.year ?? '—'} | ${p != null ? p.toFixed(2) : '—'} (${r.geoData?.name || r.municipalityName || ufLabel})`
    );
  });
  return lines.join('\n');
}

/**
 * Texto longo com dados reais da API (clima e/ou produtividade) para incluir no PDF/CSV.
 */
export async function gatherReportDados(params: {
  tipo: ReportTipoKey;
  localidadeKey: string;
  displayLocal?: string;
  startDate: string;
  endDate: string;
  /** Só `tipo === 'produtividade'`: filtra produtividade/SIDRA pela safra SIDRA (`2024/25`). */
  productivitySeason?: string;
}): Promise<string> {
  const ufLabel = normalizeReportUf(params.localidadeKey);
  const chunks: string[] = [];
  const seasonProd =
    (params.tipo === 'produtividade' || params.tipo === 'comparativo') && params.productivitySeason?.trim()
      ? params.productivitySeason.trim()
      : '';
  const isComparativoCivil = params.tipo === 'comparativo' && !seasonProd;

  if (params.tipo === 'clima' || params.tipo === 'comparativo') {
    try {
      if (params.tipo === 'comparativo' && seasonProd) {
        const comp = await getClimateVsProductivity({
          season: seasonProd,
          state: ufLabel,
        });
        const compRows = comp.success && Array.isArray(comp.data) ? comp.data : [];
        chunks.push('=== Comparativo (safra) — clima e produtividade por mês (API climate-vs-productivity) ===\n');
        chunks.push(`Safra: ${seasonProd}\n`);
        if (comp.meta?.baseYear) chunks.push(`Ano-base do clima: ${comp.meta.baseYear}\n`);
        chunks.push(formatComparativoSeasonMerged(compRows));
      } else if (!isComparativoCivil) {
        const rows = await listAllClimateRecordsInRange({
          state: ufLabel,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        chunks.push('=== Dados climáticos (API /api/climate) ===\n');
        chunks.push(formatClimateBlock(rows, ufLabel, params.startDate, params.endDate));
      }
    } catch {
      chunks.push('=== Dados climáticos ===\nNão foi possível obter os dados (rede, sessão ou servidor).');
    }
  }

  if (params.tipo === 'produtividade' || params.tipo === 'comparativo') {
    try {
      const perYear: Awaited<ReturnType<typeof listAllProductivityForYear>>[] = [];
      if (seasonProd) {
        const rows = await listAllProductivityForYear({
          state: ufLabel,
          season: seasonProd,
        });
        perYear.push(rows);
      } else {
        const p0 = isoDateParts(params.startDate);
        const p1 = isoDateParts(params.endDate);
        const y0 = p0?.year ?? NaN;
        const y1 = p1?.year ?? NaN;
        const lo = Math.min(y0, y1);
        const hi = Math.max(y0, y1);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          for (let y = lo; y <= hi; y += 1) {
            perYear.push(await listAllProductivityForYear({ state: ufLabel, year: y }));
          }
        }
      }
      const flatProd = perYear.flat();
      const monthKeysProd = monthKeysBetweenInclusive(
        String(params.startDate).slice(0, 10),
        String(params.endDate).slice(0, 10)
      );
      const byMonthFromFlat = new Map<string, ProductivityListResponse['data']>();
      for (const r of flatProd) {
        const raw = r.periodRef;
        if (raw == null || String(raw).trim() === '') continue;
        const key = String(raw).trim().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(key)) continue;
        if (!byMonthFromFlat.has(key)) byMonthFromFlat.set(key, []);
        byMonthFromFlat.get(key)!.push(r);
      }
      const monthlyBuckets: { ym: string; rows: ProductivityListResponse['data'] }[] = [];
      for (const ym of monthKeysProd) {
        let rows = byMonthFromFlat.get(ym) ?? [];
        if (rows.length === 0) {
          rows = await listAllProductivityForYear({ state: ufLabel, mesAno: ym });
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 45);
          });
        }
        monthlyBuckets.push({ ym, rows });
      }

      if (isComparativoCivil) {
        const climRows = await listAllClimateRecordsInRange({
          state: ufLabel,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        const climateSeries = climateMonthlySeriesFromRows(
          climRows,
          ufLabel,
          params.startDate,
          params.endDate
        );
        chunks.push('\n\n=== Comparativo mensal (clima × produtividade) ===\n');
        chunks.push(
          formatMergedComparativoMonthTable(
            climateSeries,
            monthlyBuckets,
            params.startDate,
            params.endDate
          )
        );
        chunks.push('\n\n=== Clima — resumo do período completo ===\n');
        chunks.push(
          climateSeries
            ? climateSeries.summaryLines.join('\n')
            : climRows.length === 0
              ? 'Sem registos diários de clima no intervalo (ou falha de rede).'
              : 'Sem agregação mensal de clima.'
        );
        chunks.push('\n\n=== Produtividade — detalhe por registo (ano, cultura, município) ===\n');
        chunks.push(formatProductivityBlock(perYear, ufLabel));
      } else {
        chunks.push('\n\n=== Produtividade (API /api/productivity) ===\n');
        if (seasonProd) chunks.push(`Safra: ${seasonProd}\n`);

        const showProdMonthly = params.tipo === 'produtividade' && monthKeysProd.length > 0;
        if (showProdMonthly) {
          chunks.push('=== Resumo mensal de produtividade ===\n');
          chunks.push(formatProductivityMonthlyTable(monthlyBuckets, ufLabel));
          chunks.push('\n\n=== Detalhe por registo (ano, cultura, município) ===\n');
        }
        chunks.push(formatProductivityBlock(perYear, ufLabel));
      }
    } catch {
      chunks.push('\n\n=== Produtividade ===\nNão foi possível obter os dados.');
    }
  }

  return chunks.join('').trim();
}
