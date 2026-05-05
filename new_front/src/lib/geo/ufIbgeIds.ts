import { IBGE_UF_COD_TO_SIGLA } from './brazilStatesMalha';

/** Sigla da UF → código numérico IBGE (ex.: TO → 17). */
export const UF_IBGE_ID_BY_SIGLA: Record<string, string> = Object.fromEntries(
  Object.entries(IBGE_UF_COD_TO_SIGLA).map(([id, sigla]) => [sigla, id])
);
