import type { ResumoClima, TipoRegistro } from '../api/diarioApi';

export const TIPOS_REGISTRO: Array<{ value: TipoRegistro; label: string }> = [
  { value: 'plantio', label: 'Plantio' },
  { value: 'adubacao', label: 'Adubação' },
  { value: 'aplicacao', label: 'Aplicação (defensivo, correção)' },
  { value: 'praga_doenca', label: 'Praga ou doença observada' },
  { value: 'colheita', label: 'Colheita' },
  { value: 'observacao', label: 'Observação geral' },
];

export function rotuloTipo(tipo: string): string {
  return TIPOS_REGISTRO.find((t) => t.value === tipo)?.label ?? tipo;
}

/** "2026-11-08" → "08/11/2026" (sem passar por Date, para não sofrer com fuso horário). */
export function formataData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

/** Texto curto para o resumo do clima de uma janela de dias; `—` quando não há dado. */
export function descreveClima(r: ResumoClima | null | undefined): string {
  if (!r || !r.dias) return 'sem dados de clima';
  const partes: string[] = [];
  if (r.chuvaMm != null) {
    partes.push(`${String(r.chuvaMm).replace('.', ',')} mm de chuva${r.diasComChuva != null ? ` em ${r.diasComChuva} dia(s)` : ''}`);
  }
  if (r.tempMedia != null) partes.push(`temperatura média de ${String(r.tempMedia).replace('.', ',')} °C`);
  return partes.length ? partes.join(', ') : 'sem dados de clima';
}
