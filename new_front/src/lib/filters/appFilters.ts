import { TOCANTINS_CITY_OPTIONS } from '../geo/tocantinsCities';

export const TO_CITY_OPTIONS_WITH_ALL = [
  { value: 'todas', label: 'Todas as cidades (TO)' },
  ...TOCANTINS_CITY_OPTIONS.map((x) => ({ value: x.value, label: x.label.replace(' - TO', '') })),
];

export const CLIMATE_PERIOD_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
];

export const PRODUCTIVITY_CROP_OPTIONS = [
  { value: '', label: 'Selecione uma cultura' },
  { value: 'soja', label: 'Soja' },
  { value: 'milho', label: 'Milho' },
  { value: 'trigo', label: 'Trigo' },
  { value: 'cafe', label: 'Café' },
  { value: 'cana', label: 'Cana-de-açúcar' },
  { value: 'algodao', label: 'Algodão' },
  { value: 'arroz', label: 'Arroz' },
  { value: 'feijao', label: 'Feijão' },
  { value: 'outros', label: 'Outros' },
];

export function getProductivityYearOptions(): Array<{ value: string; label: string }> {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, idx) => {
    const year = String(currentYear - idx);
    return { value: year, label: year };
  });
}

