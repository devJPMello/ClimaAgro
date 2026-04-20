export const CLIMATE_PERIOD_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
];

/** Rótulos amigáveis para valores de `crop_type` conhecidos no modelo. */
const PRODUCTIVITY_CROP_LABELS: Record<string, string> = {
  soja: 'Soja',
  milho: 'Milho',
  trigo: 'Trigo',
  cafe: 'Café',
  cana: 'Cana-de-açúcar',
  algodao: 'Algodão',
  arroz: 'Arroz',
  feijao: 'Feijão',
  outros: 'Outros',
};

/** Chaves canónicas conhecidas (há também slugs por produto SIDRA em `crop_type`). */
export const PRODUCTIVITY_CROP_ENUM_VALUES: string[] = Object.keys(PRODUCTIVITY_CROP_LABELS);

export function labelForProductivityCropType(value: string): string {
  const k = value.trim().toLowerCase();
  if (PRODUCTIVITY_CROP_LABELS[k]) return PRODUCTIVITY_CROP_LABELS[k];
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Opções do select com rótulos que **existem** em `productivity` (ex. GET product-labels).
 * `value` é o texto exato em `product_label` (case-sensitive) para filtrar na API.
 */
export function buildProductivityCropSelectOptions(fromDb: string[]): Array<{ value: string; label: string }> {
  const byValue = new Map<string, string>();
  for (const raw of fromDb) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (!byValue.has(v)) {
      const k = v.toLowerCase();
      if (PRODUCTIVITY_CROP_LABELS[k]) byValue.set(v, PRODUCTIVITY_CROP_LABELS[k]);
      else byValue.set(v, labelForProductivityCropType(v));
    }
  }
  const entries = [...byValue.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  return [
    { value: '', label: 'Selecione uma cultura' },
    ...entries.map(([value, label]) => ({ value, label })),
  ];
}

/** Opções estáticas (ex.: telas sem API). */
export const PRODUCTIVITY_CROP_OPTIONS = [
  { value: '', label: 'Selecione uma cultura' },
  ...Object.entries(PRODUCTIVITY_CROP_LABELS).map(([value, label]) => ({ value, label })),
];

export function getProductivityYearOptions(): Array<{ value: string; label: string }> {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, idx) => {
    const year = String(currentYear - idx);
    return { value: year, label: year };
  });
}

/** Safra no formato do banco (`ano_inicial/ano_final_curto`), ex.: `2024/25`. */
export function getProductivitySeasonOptions(): Array<{ value: string; label: string }> {
  const y0 = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, idx) => {
    const y = y0 - idx;
    const value = `${y}/${String(y + 1).slice(-2)}`;
    return { value, label: `Safra ${value}` };
  });
}

