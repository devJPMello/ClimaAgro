import { httpClient } from './httpClient';

export interface ProductivityListResponse {
  success: boolean;
  data: Array<{
    id: string;
    year: number;
    productivity: string | number | null;
    cropType?: string;
    /** Rótulo do produto (SIDRA / nome na base), chave do filtro no mapa. */
    productLabel?: string;
    state?: string;
    municipalityName?: string;
    municipalityIbgeCode?: string | null;
    /** Safra agrícola (ex.: `2024/25`), como na tabela `productivity`. */
    season?: string;
    periodRef?: string | null;
    /** Texto do back (ex. nota SIDRA quando produtividade é 0 neste município). */
    observations?: string | null;
    geoData?: { state?: string; name?: string; ibgeCode?: string | null; category?: string | null };
  }>;
}

export interface ClimateVsProductivityResponse {
  success: boolean;
  data: Array<{
    season: string;
    month?: string;
    mes?: string;
    climate: number | null;
    productivity: number | null;
    avgTemperature?: number | null;
    avgHumidity?: number | null;
  }>;
  meta?: {
    season: string;
    baseYear: number;
    startDate: string;
    endDate: string;
    municipality?: string;
    state?: string;
  };
}

/** GET /productivity/crop-types — valores distintos de `crop_type` (slug/cultura) por UF. */
export async function listProductivityCropTypes(params?: { state?: string }): Promise<{
  success: boolean;
  data: string[];
}> {
  const sp = new URLSearchParams();
  if (params?.state?.trim()) sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  const q = sp.toString();
  return httpClient.get<{ success: boolean; data: string[] }>(
    `productivity/crop-types${q ? `?${q}` : ''}`
  );
}

/** GET /productivity/product-labels — rótulos de produto distintos (ex.: nomes SIDRA) por UF. */
export async function listProductivityProductLabels(params?: { state?: string }): Promise<{
  success: boolean;
  data: string[];
}> {
  const sp = new URLSearchParams();
  if (params?.state?.trim()) sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  const q = sp.toString();
  return httpClient.get<{ success: boolean; data: string[] }>(
    `productivity/product-labels${q ? `?${q}` : ''}`
  );
}

/** GET /productivity/month-years — períodos mensais distintos (`YYYY-MM`) por UF (ou global). */
export async function listProductivityMonthYears(params?: { state?: string }): Promise<{
  success: boolean;
  data: string[];
}> {
  const sp = new URLSearchParams();
  if (params?.state?.trim()) sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  const q = sp.toString();
  return httpClient.get<{ success: boolean; data: string[] }>(
    `productivity/month-years${q ? `?${q}` : ''}`
  );
}

/** GET /productivity — lista por UF (e opcionalmente cultura, ano, município). */
export async function listProductivityRecords(params: {
  state: string;
  cropType?: string;
  productLabel?: string;
  year?: string | number;
  /** Mês-ano no formato `YYYY-MM`. */
  mesAno?: string;
  /** Legado: safra (`YYYY/YY`). */
  season?: string;
  period?: string;
  /** Nome do município como em `geo_data.name` (ex.: Palmas). */
  municipality?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductivityListResponse> {
  const sp = new URLSearchParams();
  sp.set('state', params.state);
  if (params.cropType) sp.set('cropType', params.cropType);
  if (params.productLabel?.trim()) sp.set('productLabel', params.productLabel.trim());
  if (params.mesAno?.trim()) sp.set('mesAno', params.mesAno.trim());
  else if (params.season?.trim()) sp.set('season', params.season.trim());
  else if (params.year != null && String(params.year).trim() !== '') sp.set('year', String(params.year));
  if (params.period?.trim()) sp.set('period', params.period.trim());
  if (params.municipality?.trim()) sp.set('municipality', params.municipality.trim());
  sp.set('limit', String(params.limit ?? 120));
  if (params.offset != null) sp.set('offset', String(params.offset));
  return httpClient.get<ProductivityListResponse>(`productivity/?${sp.toString()}`);
}

const PRODUCTIVITY_PAGE_MAX = 500;

/**
 * Pagina todos os registros que casam com os filtros **sem** ano/safra obrigatórios
 * (série histórica por município/cultura).
 */
export async function listAllProductivityRecords(params: {
  state: string;
  cropType?: string;
  productLabel?: string;
  municipality?: string;
}): Promise<ProductivityListResponse['data']> {
  const all: ProductivityListResponse['data'] = [];
  let offset = 0;
  const maxRows = 5000;
  while (all.length < maxRows) {
    const res = await listProductivityRecords({
      state: params.state,
      cropType: params.cropType,
      productLabel: params.productLabel,
      municipality: params.municipality,
      limit: PRODUCTIVITY_PAGE_MAX,
      offset,
    });
    if (!res.success || !res.data?.length) break;
    all.push(...res.data);
    if (res.data.length < PRODUCTIVITY_PAGE_MAX) break;
    offset += PRODUCTIVITY_PAGE_MAX;
  }
  return all;
}

/** Pagina até esgotar resultados (máx. ~5000 linhas de segurança). */
export async function listAllProductivityForYear(params: {
  state: string;
  year?: number;
  /** Mês-ano no formato `YYYY-MM`. */
  mesAno?: string;
  /** Legado: safra (`YYYY/YY`). */
  season?: string;
  period?: string;
  cropType?: string;
  productLabel?: string;
  municipality?: string;
}): Promise<ProductivityListResponse['data']> {
  const hasMesAno = Boolean(params.mesAno?.trim());
  const hasSeason = Boolean(params.season?.trim());
  const hasYear = params.year != null && Number.isFinite(Number(params.year));
  if (!hasMesAno && !hasSeason && !hasYear) return [];

  const all: ProductivityListResponse['data'] = [];
  let offset = 0;
  const maxRows = 5000;
  while (all.length < maxRows) {
    const sp = new URLSearchParams();
    sp.set('state', params.state);
    if (hasMesAno) sp.set('mesAno', params.mesAno!.trim());
    else if (hasSeason) sp.set('season', params.season!.trim());
    else sp.set('year', String(params.year));
    if (params.period?.trim()) sp.set('period', params.period.trim());
    if (params.cropType?.trim()) sp.set('cropType', params.cropType.trim());
    if (params.productLabel?.trim()) sp.set('productLabel', params.productLabel.trim());
    if (params.municipality?.trim()) sp.set('municipality', params.municipality.trim());
    sp.set('limit', String(PRODUCTIVITY_PAGE_MAX));
    sp.set('offset', String(offset));
    const res = await httpClient.get<ProductivityListResponse>(`productivity/?${sp.toString()}`);
    if (!res.success || !res.data?.length) break;
    all.push(...res.data);
    if (res.data.length < PRODUCTIVITY_PAGE_MAX) break;
    offset += PRODUCTIVITY_PAGE_MAX;
  }
  return all;
}

export async function getClimateVsProductivity(params: {
  season: string;
  state: string;
  municipality?: string;
  cropType?: string;
}): Promise<ClimateVsProductivityResponse> {
  const sp = new URLSearchParams();
  sp.set('season', params.season.trim());
  sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  if (params.municipality?.trim()) sp.set('municipality', params.municipality.trim());
  if (params.cropType?.trim()) sp.set('cropType', params.cropType.trim());
  return httpClient.get<ClimateVsProductivityResponse>(`productivity/climate-vs-productivity?${sp.toString()}`);
}
