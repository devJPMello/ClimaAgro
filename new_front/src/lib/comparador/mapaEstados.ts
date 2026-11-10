import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { IBGE_BRASIL_UFS_GEOJSON_URL, normalizeBrazilStatesFeatureCollection } from '../geo/brazilStatesMalha';

export type ContornoSvg = { d: string; largura: number; altura: number };

function aneis(geometry: Geometry | null | undefined): Position[][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

/**
 * Converte o contorno de uma UF (GeoJSON) em um caminho SVG já encaixado em `largura` x `altura`
 * (menos a margem). Projeção equiretangular corrigida pelo cosseno da latitude central, que basta para
 * desenhar um estado sem distorção visível. O Norte fica para cima.
 */
export function contornoParaSvg(feature: Feature, largura = 240, altura = 220, margem = 8): ContornoSvg | null {
  const lista = aneis(feature.geometry).filter((a) => a.length >= 3);
  if (!lista.length) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const anel of lista) {
    for (const [lon, lat] of anel) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const fatorLon = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const larguraGeo = (maxLon - minLon) * fatorLon;
  const alturaGeo = maxLat - minLat;
  if (!(larguraGeo > 0) || !(alturaGeo > 0)) return null;

  const escala = Math.min((largura - 2 * margem) / larguraGeo, (altura - 2 * margem) / alturaGeo);
  const desvioX = (largura - larguraGeo * escala) / 2;
  const desvioY = (altura - alturaGeo * escala) / 2;
  const ponto = ([lon, lat]: Position) =>
    `${(((lon - minLon) * fatorLon * escala) + desvioX).toFixed(1)},${(((maxLat - lat) * escala) + desvioY).toFixed(1)}`;

  const d = lista.map((anel) => `M${anel.map(ponto).join('L')}Z`).join('');
  return { d, largura, altura };
}

/** Acha o contorno da UF numa malha já normalizada (`properties.state` = sigla). */
export function featureDaUf(malha: FeatureCollection | null, uf: string): Feature | null {
  if (!malha) return null;
  return malha.features.find((f) => String(f.properties?.state ?? '').toUpperCase() === uf.toUpperCase()) ?? null;
}

let malhaEmCache: Promise<FeatureCollection | null> | null = null;

/** Baixa (uma única vez) a malha estadual do IBGE; usa o arquivo local se o IBGE estiver fora do ar. */
export function carregarMalhaEstados(): Promise<FeatureCollection | null> {
  if (malhaEmCache) return malhaEmCache;
  malhaEmCache = (async () => {
    for (const url of [IBGE_BRASIL_UFS_GEOJSON_URL, '/data/brazil-states.geojson']) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const resposta = await fetch(url);
        if (!resposta.ok) continue;
        // eslint-disable-next-line no-await-in-loop
        const dados = await resposta.json();
        if (dados?.type === 'FeatureCollection' && Array.isArray(dados.features)) {
          return normalizeBrazilStatesFeatureCollection(dados as FeatureCollection);
        }
      } catch {
        /* tenta a próxima fonte */
      }
    }
    return null;
  })().then((m) => {
    if (!m) malhaEmCache = null; // permite nova tentativa depois de uma falha
    return m;
  });
  return malhaEmCache;
}
