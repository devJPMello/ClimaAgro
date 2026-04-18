import { httpClient } from './httpClient';
import type { DashboardSummaryDto } from './contracts/climate';

/**
 * Resumo do dashboard — `GET climate/dashboard-summary`.
 * `state`: sigla UF (ex. `TO`) para KPIs e linhas só desse estado.
 */
export async function getDashboardSummary(params?: { state?: string }): Promise<DashboardSummaryDto> {
  const raw = params?.state?.trim().toUpperCase();
  const uf = raw && raw.length === 2 ? raw : 'TO';
  return httpClient.get<DashboardSummaryDto>(`climate/dashboard-summary?state=${encodeURIComponent(uf)}`);
}

export interface ClimateListResponse {
  success: boolean;
  data: Array<{
    id: string;
    date: string;
    avgTemperature?: string | number | null;
    precipitation?: string | number | null;
    humidity?: string | number | null;
    windSpeed?: string | number | null;
    geoData?: { name?: string; state?: string };
  }>;
}

/** GET /climate — registros diários por UF e intervalo de datas. `place`: nome exato do município em geo_data (ex.: Palmas). */
export async function listClimateRecords(params: {
  state: string;
  startDate: string;
  endDate: string;
  place?: string;
  limit?: number;
  offset?: number;
}): Promise<ClimateListResponse> {
  const sp = new URLSearchParams();
  sp.set('state', params.state);
  sp.set('startDate', params.startDate);
  sp.set('endDate', params.endDate);
  sp.set('limit', String(params.limit ?? 800));
  if (params.offset != null) sp.set('offset', String(params.offset));
  if (params.place?.trim()) sp.set('place', params.place.trim());
  return httpClient.get<ClimateListResponse>(`climate/?${sp.toString()}`);
}

const CLIMATE_PAGE_MAX = 1000;

/**
 * Busca todos os registros do intervalo (paginação automática até o limite de segurança).
 * O backend limita `limit` a 1000; intervalos longos exigem várias páginas.
 */
export async function listAllClimateRecordsInRange(params: {
  state: string;
  startDate: string;
  endDate: string;
  place?: string;
}): Promise<ClimateListResponse['data']> {
  const all: ClimateListResponse['data'] = [];
  let offset = 0;
  const maxRows = 20_000;
  while (all.length < maxRows) {
    const page = await listClimateRecords({
      ...params,
      limit: CLIMATE_PAGE_MAX,
      offset,
    });
    if (!page.success || !page.data?.length) break;
    all.push(...page.data);
    if (page.data.length < CLIMATE_PAGE_MAX) break;
    offset += CLIMATE_PAGE_MAX;
  }
  return all;
}
