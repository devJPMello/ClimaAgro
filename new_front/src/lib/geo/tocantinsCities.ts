export const TOCANTINS_CITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'palmas', label: 'Palmas - TO' },
  { value: 'araguaina', label: 'Araguaína - TO' },
  { value: 'gurupi', label: 'Gurupi - TO' },
  { value: 'porto-nacional', label: 'Porto Nacional - TO' },
  { value: 'paraiso-to', label: 'Paraíso do Tocantins - TO' },
  { value: 'guarai', label: 'Guaraí - TO' },
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
  ...TOCANTINS_CITY_OPTIONS.map((x) => ({ value: x.value, label: x.label.replace(' - TO', '') })),
];

export function getTocantinsCityLabel(value: string): string {
  const option = TOCANTINS_CITY_OPTIONS.find((x) => x.value === value);
  return option?.label ?? value;
}
