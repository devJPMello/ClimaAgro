import { listAllClimateRecordsInRange, type ClimateListResponse } from '../api/climateApi';
import { listAllIbgeSidra1612Rows } from '../api/ibgeSidra1612Api';
import { listAllProductivityForYear, type ProductivityListResponse } from '../api/productivityApi';
import { TOCANTINS_CITY_VALUE_TO_NAME } from '../geo/tocantinsCities';

export type ReportTipoKey = 'clima' | 'produtividade' | 'comparativo';

/** Nome do município como em `geo_data.name` (ex.: Palmas). Aceita chave legada (`palmas`) ou nome oficial IBGE. */
export function climatePlaceFromUi(localidadeKey: string, displayLocal?: string): string {
  const byKey = TOCANTINS_CITY_VALUE_TO_NAME[localidadeKey as keyof typeof TOCANTINS_CITY_VALUE_TO_NAME];
  if (byKey) return byKey;
  const stripped = (displayLocal || localidadeKey || '').replace(/\s*-\s*TO\s*$/i, '').trim();
  return stripped || 'Palmas';
}

export function reportTipoFromStoredLabel(tipo: string): ReportTipoKey {
  const t = tipo.toLowerCase();
  if (t.includes('produtividade')) return 'produtividade';
  if (t.includes('comparativo')) return 'comparativo';
  return 'clima';
}

export function localidadeKeyFromStoredLocal(localLabel: string): string {
  const normalized = localLabel.replace(/\s*-\s*TO\s*$/i, '').trim();
  const hit = Object.entries(TOCANTINS_CITY_VALUE_TO_NAME).find(([, name]) =>
    normalized.toLowerCase().startsWith(name.toLowerCase())
  );
  if (hit) return hit[0];
  return normalized || 'Palmas';
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

/**
 * Histórico gravado como `Safra 2024/25` (produtividade) ou `AAAA-MM-DD — AAAA-MM-DD`.
 */
export function parseExportPeriodoLabel(periodo: string): {
  startDate: string;
  endDate: string;
  productivitySeason?: string;
} {
  const trimmed = periodo.trim();
  const safraM = /^Safra\s+(\d{4}\/\d{2})$/i.exec(trimmed);
  if (safraM) {
    const season = safraM[1];
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
    `Município (filtro): ${place}`,
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

function formatProductivityBlock(perYear: ProductivityListResponse['data'][], place: string): string {
  const flat = perYear.flat();
  const placeLc = place.trim().toLowerCase();
  const forMun = flat.filter((r) => {
    const gd = (r.geoData?.name || '').trim().toLowerCase();
    const mn = (r.municipalityName || '').trim().toLowerCase();
    return gd === placeLc || mn === placeLc || mn.includes(placeLc) || placeLc.includes(mn);
  });
  const use = forMun.length ? forMun : flat;
  if (!use.length) {
    return `Sem registos de produtividade para o estado TO no período de anos consultado.`;
  }
  const head = forMun.length
    ? `Registos alinhados ao município «${place}»: ${forMun.length}.`
    : `Sem linhas com nome de município coincidente com «${place}»; a seguir consta o conjunto TO devolvido pela API (${use.length} linhas).`;
  const lines = [head, '', 'Produto / cultura | Ano | Produtividade (t/ha)'];
  const sorted = [...use].sort((a, b) => {
    const cp = String(a.productLabel || a.cropType || '').localeCompare(
      String(b.productLabel || b.cropType || '')
    );
    if (cp !== 0) return cp;
    return (a.year || 0) - (b.year || 0);
  });
  sorted.forEach((r) => {
    const p = n(r.productivity);
    const cult = r.productLabel || r.cropType || '—';
    lines.push(
      `${cult} | ${r.year ?? '—'} | ${p != null ? p.toFixed(2) : '—'} (${r.geoData?.name || r.municipalityName || 'TO'})`
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
  const place = climatePlaceFromUi(params.localidadeKey, params.displayLocal);
  const chunks: string[] = [];

  if (params.tipo === 'clima' || params.tipo === 'comparativo') {
    try {
      const rows = await listAllClimateRecordsInRange({
        state: 'TO',
        startDate: params.startDate,
        endDate: params.endDate,
        place,
      });
      chunks.push('=== Dados climáticos (API /api/climate) ===\n');
      chunks.push(formatClimateBlock(rows, place));
    } catch {
      chunks.push('=== Dados climáticos ===\nNão foi possível obter os dados (rede, sessão ou servidor).');
    }
  }

  if (params.tipo === 'produtividade' || params.tipo === 'comparativo') {
    try {
      const seasonProd =
        params.tipo === 'produtividade' && params.productivitySeason?.trim()
          ? params.productivitySeason.trim()
          : '';
      const perYear: Awaited<ReturnType<typeof listAllProductivityForYear>>[] = [];
      if (seasonProd) {
        const rows = await listAllProductivityForYear({
          state: 'TO',
          season: seasonProd,
          municipality: place,
        });
        perYear.push(rows);
      } else {
        const y0 = new Date(params.startDate).getFullYear();
        const y1 = new Date(params.endDate).getFullYear();
        const lo = Math.min(y0, y1);
        const hi = Math.max(y0, y1);
        for (let y = lo; y <= hi; y += 1) {
          perYear.push(await listAllProductivityForYear({ state: 'TO', year: y, municipality: place }));
        }
      }
      chunks.push('\n\n=== Produtividade (API /api/productivity) ===\n');
      if (seasonProd) chunks.push(`Safra: ${seasonProd}\n`);
      chunks.push(formatProductivityBlock(perYear, place));
    } catch {
      chunks.push('\n\n=== Produtividade ===\nNão foi possível obter os dados.');
    }

    try {
      const seasonProd =
        params.tipo === 'produtividade' && params.productivitySeason?.trim()
          ? params.productivitySeason.trim()
          : '';
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
          municipality: place,
          year: reportYear,
        });
        if (!rows.length) continue;
        anySidra = true;
        sidraParts.push(
          `--- Ano ${reportYear} (${rows.length} linhas) ---`,
          ...rows.map(
            (r) =>
              `${r.year} | ${r.municipalityName} | ${r.productLabel} | ${r.variableKey} | ${r.valueNumeric ?? '—'}`,
          ),
        );
      }
      if (anySidra) {
        chunks.push('\n\n=== SIDRA 1612 (API /api/ibge-sidra-1612 — PostgreSQL) ===\n');
        chunks.push(`Filtro: município «${place}», anos ${loSidra}–${hiSidra}.\n\n`);
        chunks.push(sidraParts.join('\n'));
      } else {
        chunks.push(
          '\n\n=== SIDRA 1612 (API /api/ibge-sidra-1612) ===\nSem registos para este município nos anos do período na tabela ibge_sidra_1612.',
        );
      }
    } catch {
      chunks.push('\n\n=== SIDRA 1612 ===\nNão foi possível obter dados da tabela ibge_sidra_1612.');
    }
  }

  return chunks.join('').trim();
}
