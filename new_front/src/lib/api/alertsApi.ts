import { httpClient } from './httpClient';
import type { ClimateAlertListDto } from './contracts/alerts';

/**
 * Lista de alertas climáticos — `GET climate/alerts`.
 * `state`: sigla UF (ex. `SP`) para restringir clima derivado e alertas oficiais a essa UF.
 * Omitir `state` ou usar `ALL`: visão Brasil (sem filtro de UF no backend).
 * `city`: opcional — filtro fino em alertas oficiais por município (payload INMET).
 */
export async function listClimateAlerts(params?: { state?: string; city?: string }): Promise<ClimateAlertListDto> {
  const sp = new URLSearchParams();
  const raw = params?.state?.trim().toUpperCase();
  if (raw && raw.length === 2 && raw !== 'ALL') {
    sp.set('state', raw);
  }
  if (params?.city?.trim()) sp.set('city', params.city.trim());
  const qs = sp.toString();
  return httpClient.get<ClimateAlertListDto>(qs ? `climate/alerts?${qs}` : 'climate/alerts');
}
