/** UF padrão do app (Tocantins) — código numérico IBGE da UF. */
export const DEFAULT_IBGE_UF_ID = '17';

/**
 * JSON da API de localidades: municípios da UF.
 * Em `.env`: `VITE_IBGE_LOCALIDADES_MUNICIPIOS_URL` (URL completa ou com `{uf_id}` no path).
 */
export function getIbgeLocalidadesMunicipiosUrl(ufId: string = DEFAULT_IBGE_UF_ID): string {
  const raw = (import.meta.env.VITE_IBGE_LOCALIDADES_MUNICIPIOS_URL as string | undefined)?.trim();
  const template =
    raw ||
    'https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf_id}/municipios';
  if (template.includes('{uf_id}')) return template.replaceAll('{uf_id}', ufId);
  return template;
}

/**
 * GeoJSON da malha municipal (uma feição por município), para Leaflet / camadas.
 * Em `.env`: `VITE_IBGE_MALHA_UF_MUNICIPIOS_GEOJSON_URL`.
 */
export function getIbgeMalhaUfMunicipiosGeoJsonUrl(ufId: string = DEFAULT_IBGE_UF_ID): string {
  const raw = (import.meta.env.VITE_IBGE_MALHA_UF_MUNICIPIOS_GEOJSON_URL as string | undefined)?.trim();
  if (raw) {
    if (raw.includes('{uf_id}')) return raw.replaceAll('{uf_id}', ufId);
    return raw;
  }
  return `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufId}?formato=application/vnd.geo+json&resolucao=5&intrarregiao=Municipio`;
}
