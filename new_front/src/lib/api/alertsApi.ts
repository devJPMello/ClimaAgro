import { httpClient } from './httpClient';
import type { ClimateAlertListDto } from './contracts/alerts';

/**
 * Lista de alertas climáticos — `GET climate/alerts`.
 * `state`: sigla UF (ex. `TO`) para restringir dados e alertas oficiais a essa UF.
 * `city`: município (ex. `Palmas`) para filtrar alertas oficiais que tragam cidades no payload.
 */
export async function listClimateAlerts(params?: { state?: string; city?: string }): Promise<ClimateAlertListDto> {
  const raw = params?.state?.trim().toUpperCase();
  const uf = raw && raw.length === 2 ? raw : 'TO';
  const sp = new URLSearchParams();
  sp.set('state', uf);
  if (params?.city?.trim()) sp.set('city', params.city.trim());
  return httpClient.get<ClimateAlertListDto>(`climate/alerts?${sp.toString()}`);
}
