import { listAllClimateRecordsInRange, type ClimateListResponse } from '../api/climateApi';
import { listAllIbgeSidra1612Rows } from '../api/ibgeSidra1612Api';
import {
  getClimateVsProductivity,
  listAllProductivityForYear,
  type ProductivityListResponse,
} from '../api/productivityApi';
import { labelForProductivityCropType } from '../filters/appFilters';
import { formatUfLabel, UF_NOME } from '../geo/brazilStatesMalha';
import { REPORT_EXPORT_UF, TOCANTINS_CITY_VALUE_TO_NAME } from '../geo/tocantinsCities';

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

function formatClimateBlock(rows: ClimateListResponse['data'], place: string): string {
  if (!rows.length) {
    return `Sem registos diários de clima para «${place}» no intervalo pedido. Execute a sincronização de clima no servidor se a base estiver vazia.`;
  }
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
  const lines: string[] = [
    `UF (filtro): ${formatUfLabel(place)}`,
    `Registos diários: ${sorted.length}`,
    nT ? `Temperatura média (média das médias diárias): ${(sumT / nT).toFixed(1)} °C` : 'Temperatura média: —',
    nP ? `Precipitação acumulada (soma dos dias): ${sumP.toFixed(1)} mm` : 'Precipitação: —',
    nH ? `Umidade média: ${(sumH / nH).toFixed(0)} %` : 'Umidade: —',
    nW ? `Velocidade média do vento: ${(sumW / nW).toFixed(1)} km/h` : 'Vento: —',
    '',
    'Amostra (primeiros 10 dias):',
  ];
  const sample = sorted.slice(0, 10);
  for (const r of sample) {
    const t = temperatureFromClimateRow(r);
    const p = n(r.precipitation);
    lines.push(
      `  ${r.date} | T média ${t != null ? `${t.toFixed(1)} °C` : '—'} | chuva ${p != null ? `${p.toFixed(1)} mm` : '—'}`
    );
  }
  if (sorted.length > 10) {
    lines.push('', 'Últimos 5 dias do período:');
    sorted.slice(-5).forEach((r) => {
      const t = temperatureFromClimateRow(r);
      const p = n(r.precipitation);
      lines.push(
        `  ${r.date} | T média ${t != null ? `${t.toFixed(1)} °C` : '—'} | chuva ${p != null ? `${p.toFixed(1)} mm` : '—'}`
      );
    });
  }
  return lines.join('\n');
}

function formatComparativoClimateBlock(rows: Array<{
  mes?: string;
  month?: string;
  climate: number | null;
  avgTemperature?: number | null;
  avgHumidity?: number | null;
}>): string {
  if (!rows.length) {
    return 'Sem dados climáticos históricos retornados pela rota de comparativo para a safra selecionada.';
  }
  const sorted = [...rows].sort((a, b) => String(a.month || a.mes || '').localeCompare(String(b.month || b.mes || '')));
  const totalPrecip = sorted.reduce((acc, row) => acc + (Number.isFinite(Number(row.climate)) ? Number(row.climate) : 0), 0);
  const tempVals = sorted
    .map((row) => Number(row.avgTemperature))
    .filter((x) => Number.isFinite(x));
  const humVals = sorted
    .map((row) => Number(row.avgHumidity))
    .filter((x) => Number.isFinite(x));
  const lines: string[] = [
    `Meses retornados: ${sorted.length}`,
    `Precipitação acumulada no ano-base: ${totalPrecip.toFixed(1)} mm`,
    tempVals.length ? `Temperatura média mensal (média das médias): ${mean(tempVals).toFixed(1)} °C` : 'Temperatura média mensal: —',
    humVals.length ? `Umidade média mensal (média das médias): ${mean(humVals).toFixed(0)} %` : 'Umidade média mensal: —',
    '',
    'Detalhe mensal:',
  ];
  sorted.forEach((row) => {
    lines.push(
      `  ${row.mes || row.month || '—'} | chuva ${row.climate != null ? `${Number(row.climate).toFixed(1)} mm` : '—'} | T média ${
        row.avgTemperature != null ? `${Number(row.avgTemperature).toFixed(1)} °C` : '—'
      } | umidade ${row.avgHumidity != null ? `${Number(row.avgHumidity).toFixed(0)} %` : '—'}`
    );
  });
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

  if (params.tipo === 'clima' || params.tipo === 'comparativo') {
    try {
      if (params.tipo === 'comparativo' && seasonProd) {
        const comp = await getClimateVsProductivity({
          season: seasonProd,
          state: ufLabel,
        });
        const compRows = comp.success && Array.isArray(comp.data) ? comp.data : [];
        chunks.push('=== Dados climáticos (API /api/productivity/climate-vs-productivity) ===\n');
        chunks.push(`Safra: ${seasonProd}\n`);
        if (comp.meta?.baseYear) chunks.push(`Ano-base do clima: ${comp.meta.baseYear}\n`);
        chunks.push(formatComparativoClimateBlock(compRows));
      } else {
        const rows = await listAllClimateRecordsInRange({
          state: ufLabel,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        chunks.push('=== Dados climáticos (API /api/climate) ===\n');
        chunks.push(formatClimateBlock(rows, ufLabel));
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
        const y0 = new Date(params.startDate).getFullYear();
        const y1 = new Date(params.endDate).getFullYear();
        const lo = Math.min(y0, y1);
        const hi = Math.max(y0, y1);
        for (let y = lo; y <= hi; y += 1) {
          perYear.push(await listAllProductivityForYear({ state: ufLabel, year: y }));
        }
      }
      chunks.push('\n\n=== Produtividade (API /api/productivity) ===\n');
      if (seasonProd) chunks.push(`Safra: ${seasonProd}\n`);
      chunks.push(formatProductivityBlock(perYear, ufLabel));
    } catch {
      chunks.push('\n\n=== Produtividade ===\nNão foi possível obter os dados.');
    }

    try {
      let loSidra: number;
      let hiSidra: number;
      if (seasonProd) {
        const b = parseSeasonToCalendarBounds(seasonProd);
        if (b) {
          loSidra = b.start;
          hiSidra = b.end;
        } else {
          const y0 = new Date(params.startDate).getFullYear();
          const y1 = new Date(params.endDate).getFullYear();
          loSidra = Math.min(y0, y1);
          hiSidra = Math.max(y0, y1);
        }
      } else {
        const y0 = new Date(params.startDate).getFullYear();
        const y1 = new Date(params.endDate).getFullYear();
        loSidra = Math.min(y0, y1);
        hiSidra = Math.max(y0, y1);
      }
      const sidraParts: string[] = [];
      let anySidra = false;
      for (let reportYear = loSidra; reportYear <= hiSidra; reportYear += 1) {
        const rows = await listAllIbgeSidra1612Rows({
          state: ufLabel,
          year: reportYear,
        });
        if (!rows.length) continue;
        anySidra = true;
        sidraParts.push(
          `--- Ano ${reportYear} (${rows.length} linhas) ---`,
          ...rows.map(
            (r) =>
              `${r.year} | ${r.municipalityName} | ${labelForProductivityCropType(String(r.productLabel || '')) || r.productLabel || '—'} | ${r.variableKey} | ${r.valueNumeric ?? '—'}`,
          ),
        );
      }
      if (anySidra) {
        chunks.push('\n\n=== SIDRA 1612 (API /api/ibge-sidra-1612 — PostgreSQL) ===\n');
        chunks.push(`Filtro: UF «${formatUfLabel(ufLabel)}», anos ${loSidra}–${hiSidra}.\n\n`);
        chunks.push(sidraParts.join('\n'));
      } else {
        chunks.push(
          '\n\n=== SIDRA 1612 (API /api/ibge-sidra-1612) ===\nSem registos para esta UF nos anos do período na tabela ibge_sidra_1612.',
        );
      }
    } catch {
      chunks.push('\n\n=== SIDRA 1612 ===\nNão foi possível obter dados da tabela ibge_sidra_1612.');
    }
  }

  return chunks.join('').trim();
}
