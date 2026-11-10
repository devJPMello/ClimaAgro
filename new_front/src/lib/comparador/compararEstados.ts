export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type PontoSerie = { date: string; value: number | null };

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function arredonda(v: number, casas = 1): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

export function media(valores: Array<number | null | undefined>): number | null {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? arredonda(v.reduce((a, b) => a + b, 0) / v.length, 2) : null;
}

/**
 * Chuva mensal média: soma a chuva diária de cada mês de cada ano e tira a média, por mês do calendário.
 * Devolve 12 posições (jan a dez); `null` quando nenhum ano tem dado naquele mês.
 */
export function chuvaMensalMedia(serie: PontoSerie[]): Array<number | null> {
  const somaPorAnoMes = new Map<string, number>();
  for (const p of serie) {
    const ym = String(p.date || '').slice(0, 7);
    const v = num(p.value);
    if (!/^\d{4}-\d{2}$/.test(ym) || v == null) continue;
    somaPorAnoMes.set(ym, (somaPorAnoMes.get(ym) ?? 0) + v);
  }
  const porMes: number[][] = Array.from({ length: 12 }, () => []);
  for (const [ym, soma] of somaPorAnoMes) {
    porMes[parseInt(ym.slice(5, 7), 10) - 1].push(soma);
  }
  return porMes.map((somas) => (somas.length ? arredonda(somas.reduce((a, b) => a + b, 0) / somas.length) : null));
}

/** Produtividade média (t/ha) por ano, a partir das linhas da API de produtividade. */
export function produtividadePorAno(
  linhas: Array<{ year?: number | string; productivity?: unknown }>,
  anos: number[]
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const ano of anos) {
    out[String(ano)] = media(linhas.filter((l) => Number(l.year) === ano).map((l) => num(l.productivity)));
  }
  return out;
}

/** Anos do intervalo escolhido (inclusive), em ordem crescente, mesmo que os extremos venham invertidos. */
export function anosDoIntervalo(inicio: string, fim: string): number[] {
  const a = parseInt(inicio, 10);
  const b = parseInt(fim, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  const ini = Math.min(a, b);
  const end = Math.max(a, b);
  return Array.from({ length: end - ini + 1 }, (_, i) => ini + i);
}

export type ResumoEstado = {
  uf: string;
  temperatura: string;
  precipitacao: string;
  produtividadeUltimoAno: string;
  alertas: number;
  produtividadeMediaPeriodo: number | null;
  chuvaMensalMediaPeriodo: number | null;
};

const CABECALHO_CSV = [
  'UF',
  'Temperatura (14 dias)',
  'Precipitação (14 dias)',
  'Produtividade (último ano)',
  'Alertas',
  'Produtividade média no período (t/ha)',
  'Chuva mensal média no período (mm)',
];

/** CSV (separador ;) com o resumo da comparação, pronto para abrir no Excel. */
export function resumoParaCsv(linhas: ResumoEstado[]): string {
  const campo = (v: string | number | null) => `"${String(v ?? '—').replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) =>
    [
      l.uf,
      l.temperatura,
      l.precipitacao,
      l.produtividadeUltimoAno,
      l.alertas,
      l.produtividadeMediaPeriodo,
      l.chuvaMensalMediaPeriodo,
    ]
      .map(campo)
      .join(';')
  );
  return [CABECALHO_CSV.map(campo).join(';'), ...corpo].join(String.fromCharCode(13, 10));
}
