import { formatUfLabel, UF_NOME } from './brazilStatesMalha';

const TO_UF_LABEL = formatUfLabel('TO');

export const TOCANTINS_CITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'palmas', label: `Palmas — ${TO_UF_LABEL}` },
  { value: 'araguaina', label: `Araguaína — ${TO_UF_LABEL}` },
  { value: 'gurupi', label: `Gurupi — ${TO_UF_LABEL}` },
  { value: 'porto-nacional', label: `Porto Nacional — ${TO_UF_LABEL}` },
  { value: 'paraiso-to', label: `Paraíso do Tocantins — ${TO_UF_LABEL}` },
  { value: 'guarai', label: `Guaraí — ${TO_UF_LABEL}` },
];

export const TOCANTINS_CITY_VALUE_TO_NAME: Record<string, string> = {
  palmas: 'Palmas',
  araguaina: 'Araguaína',
  gurupi: 'Gurupi',
  'porto-nacional': 'Porto Nacional',
  'paraiso-to': 'Paraíso do Tocantins',
  guarai: 'Guaraí',
};

export const TO_CITY_VALUE_TO_NAME = TOCANTINS_CITY_VALUE_TO_NAME;

export const TO_CITY_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'todos', label: 'Todos' },
  ...Object.entries(TOCANTINS_CITY_VALUE_TO_NAME).map(([value, name]) => ({ value, label: name })),
];

export function getTocantinsCityLabel(value: string): string {
  const option = TOCANTINS_CITY_OPTIONS.find((x) => x.value === value);
  return option?.label ?? value;
}

/** Sigla da UF por defeito nos relatórios (Tocantins). */
export const REPORT_EXPORT_UF = 'TO';

/** Rótulo para relatório/exportação: sigla UF → «Nome (UF)»; legado Tocantins por slug/cidade. */
export function displayLocalidadeLabel(keyOrName: string): string {
  const raw = String(keyOrName || '').trim();
  const sigla = raw.toUpperCase();
  if (sigla.length === 2 && UF_NOME[sigla]) {
    return formatUfLabel(sigla);
  }
  const fromSlug = getTocantinsCityLabel(keyOrName);
  if (fromSlug !== keyOrName || raw.includes('-')) return fromSlug;
  return `${keyOrName} — ${formatUfLabel('TO')}`;
}
