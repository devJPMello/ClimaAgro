import { httpClient } from './httpClient';

export type IbgeSidra1612RowDto = {
  id: string;
  year: number;
  municipalityName: string;
  productLabel: string;
  variableKey: string;
  valueNumeric: string | number | null;
  geoDataId: string | null;
};

export type IbgeSidra1612ListResponse = {
  success: boolean;
  data: IbgeSidra1612RowDto[];
  pagination: { total: number; limit: number; offset: number; pages: number };
};

export type IbgeSidra1612ProductLabelDto = {
  productLabel: string;
  /** Valor de `crop_type` em `productivity` (cultura canónica ou slug SIDRA). */
  cropType: string;
};

/** GET /ibge-sidra-1612/product-labels — produtos distintos SIDRA por UF (join com `geo_data`). */
export async function listIbgeSidra1612ProductLabels(params?: {
  state?: string;
}): Promise<{ success: boolean; data: IbgeSidra1612ProductLabelDto[] }> {
  const sp = new URLSearchParams();
  if (params?.state?.trim()) sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  const q = sp.toString();
  return httpClient.get<{ success: boolean; data: IbgeSidra1612ProductLabelDto[] }>(
    `ibge-sidra-1612/product-labels${q ? `?${q}` : ''}`
  );
}

/** GET /ibge-sidra-1612 — observações SIDRA 1612 (tabela `ibge_sidra_1612`). */
export async function listIbgeSidra1612Rows(params: {
  year?: number;
  /** Filtra municípios cuja `geo_data.state` coincide (ex.: TO). */
  state?: string;
  municipality?: string;
  variable?: string;
  product?: string;
  limit?: number;
  offset?: number;
}): Promise<IbgeSidra1612ListResponse> {
  const sp = new URLSearchParams();
  if (params.year != null) sp.set('year', String(params.year));
  if (params.state?.trim()) sp.set('state', params.state.trim().toUpperCase().slice(0, 2));
  if (params.municipality?.trim()) sp.set('municipality', params.municipality.trim());
  if (params.variable?.trim()) sp.set('variable', params.variable.trim());
  if (params.product?.trim()) sp.set('product', params.product.trim());
  sp.set('limit', String(params.limit ?? 150));
  if (params.offset != null) sp.set('offset', String(params.offset));
  return httpClient.get<IbgeSidra1612ListResponse>(`ibge-sidra-1612/?${sp.toString()}`);
}

const SIDRA_PAGE_MAX = 500;

/** Pagina até esgotar o critério (máx. 50 000 linhas de segurança). */
export async function listAllIbgeSidra1612Rows(params: {
  year: number;
  state?: string;
  municipality?: string;
  variable?: string;
  product?: string;
}): Promise<IbgeSidra1612RowDto[]> {
  const all: IbgeSidra1612RowDto[] = [];
  let offset = 0;
  const maxRows = 50_000;
  while (all.length < maxRows) {
    const res = await listIbgeSidra1612Rows({
      ...params,
      limit: SIDRA_PAGE_MAX,
      offset,
    });
    if (!res.success || !res.data?.length) break;
    all.push(...res.data);
    if (res.data.length < SIDRA_PAGE_MAX) break;
    offset += SIDRA_PAGE_MAX;
  }
  return all;
}
