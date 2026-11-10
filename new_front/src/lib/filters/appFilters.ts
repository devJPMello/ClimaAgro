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

/**
 * Remove o código numérico do IBGE/SIDRA usado no início de `product_label` (ex.: `2813 - Soja` → `Soja`).
 * Não altera o valor enviado à API — só o texto exibido.
 */
export function stripIbgeSidraProductCodePrefix(raw: string): string {
  const source = String(raw || '')
    .replace(/^[^\p{L}\d]+/u, '')
    .trim();
  if (!source) return source;

  const tokens = source.split(/\s+/).filter(Boolean);
  const isNumericCode = (token: string) => /^\d+(?:[./-]\d+)*$/.test(token);

  let idx = 0;
  while (idx < tokens.length && isNumericCode(tokens[idx])) idx += 1;

  const cleaned = (idx > 0 ? tokens.slice(idx).join(' ') : source)
    .replace(/^[-–·.:/]+\s*/u, '')
    .trim();

  return cleaned || source;
}

/** Corrige caixa mista vinda do SIDRA (ex.: "AlgodãO HerbáCeo") sem mexer em espaços. */
function titleCaseWordsPt(s: string): string {
  const lower = s.trim().toLowerCase().normalize('NFC');
  return lower
    .split(/(\s+)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1);
    })
    .join('');
}

export function labelForProductivityCropType(value: string): string {
  const stripped = stripIbgeSidraProductCodePrefix(value);
  const k = stripped.trim().toLowerCase();
  if (PRODUCTIVITY_CROP_LABELS[k]) return PRODUCTIVITY_CROP_LABELS[k];
  return titleCaseWordsPt(k.replace(/_/g, ' '));
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
  return Array.from({ length: 4 }, (_, idx) => {
    const year = String(currentYear - idx);
    return { value: year, label: year };
  });
}

/** Explica, junto de qualquer filtro de ano, por que só aparecem esses anos. */
export function getYearRangeNote(): string {
  const anos = getProductivityYearOptions().map((o) => o.value);
  const ini = anos[anos.length - 1];
  const fim = anos[0];
  return `Os anos listados vão de ${ini} a ${fim} porque é o período coberto pela base do ClimaAgro: os dados de clima e de produtividade foram coletados a partir de janeiro de ${ini}, e o ano mais recente é o ano em curso. Anos fora dessa janela não têm dados no sistema.`;
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

