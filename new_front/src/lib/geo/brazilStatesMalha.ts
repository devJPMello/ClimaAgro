import type { Feature, FeatureCollection } from 'geojson';

/**
 * Malha estadual (contornos reais) — API pública IBGE.
 * O ficheiro em `public/data/brazil-states.geojson` são apenas bounding boxes; serve de fallback offline.
 */
export const IBGE_BRASIL_UFS_GEOJSON_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&resolucao=2&intrarregiao=UF';

/** Código da UF (IBGE `codarea` na malha) → sigla. */
export const IBGE_UF_COD_TO_SIGLA: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
};

export const UF_NOME: Record<string, string> = {
  RO: 'Rondônia',
  AC: 'Acre',
  AM: 'Amazonas',
  RR: 'Roraima',
  PA: 'Pará',
  AP: 'Amapá',
  TO: 'Tocantins',
  MA: 'Maranhão',
  PI: 'Piauí',
  CE: 'Ceará',
  RN: 'Rio Grande do Norte',
  PB: 'Paraíba',
  PE: 'Pernambuco',
  AL: 'Alagoas',
  SE: 'Sergipe',
  BA: 'Bahia',
  MG: 'Minas Gerais',
  ES: 'Espírito Santo',
  RJ: 'Rio de Janeiro',
  SP: 'São Paulo',
  PR: 'Paraná',
  SC: 'Santa Catarina',
  RS: 'Rio Grande do Sul',
  MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso',
  GO: 'Goiás',
  DF: 'Distrito Federal',
};

/**
 * Garante `properties.state` (sigla) e `properties.name` para coroplética e popups,
 * quer a fonte seja IBGE (`codarea`) quer o GeoJSON local (`state` já preenchido).
 */
export function normalizeBrazilStatesFeatureCollection(data: FeatureCollection): FeatureCollection {
  return {
    ...data,
    features: data.features.map((f): Feature => {
      if (f.type !== 'Feature') return f as Feature;
      const p = (f.properties || {}) as Record<string, unknown>;
      const codRaw = String(p.codarea ?? '').replace(/\D/g, '');
      const fromCod = codRaw ? IBGE_UF_COD_TO_SIGLA[codRaw] : '';
      const existing = String(p.state ?? p.sigla ?? p.UF ?? p.uf ?? '')
        .trim()
        .toUpperCase()
        .slice(0, 2);
      const uf = existing || fromCod;
      const name =
        String(p.name ?? p.NM_ESTADO ?? '')
          .trim() || (uf ? UF_NOME[uf] || uf : 'Estado');
      return {
        ...f,
        properties: { ...p, state: uf || p.state, name },
      };
    }),
  };
}
