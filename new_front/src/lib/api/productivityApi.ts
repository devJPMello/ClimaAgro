import { httpClient } from './httpClient';

export interface ProductivityListResponse {
  success: boolean;
  data: Array<{
    id: string;
    year: number;
    productivity: string | number | null;
    cropType?: string;
    geoData?: { state?: string; name?: string };
  }>;
}

/** GET /productivity — lista por UF (e opcionalmente cultura). */
export async function listProductivityRecords(params: {
  state: string;
  cropType?: string;
  year?: string | number;
  limit?: number;
}): Promise<ProductivityListResponse> {
  const sp = new URLSearchParams();
  sp.set('state', params.state);
  if (params.cropType) sp.set('cropType', params.cropType);
  if (params.year != null && String(params.year).trim() !== '') sp.set('year', String(params.year));
  sp.set('limit', String(params.limit ?? 80));
  return httpClient.get<ProductivityListResponse>(`productivity/?${sp.toString()}`);
}
