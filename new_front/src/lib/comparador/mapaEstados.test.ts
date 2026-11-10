import type { Feature, FeatureCollection } from 'geojson';
import { contornoParaSvg, featureDaUf } from './mapaEstados';

const quadrado: Feature = {
  type: 'Feature',
  properties: { state: 'TO' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-50, -10], [-48, -10], [-48, -8], [-50, -8], [-50, -10]]],
  },
};

describe('mapa dos estados', () => {
  test('contornoParaSvg encaixa o desenho na caixa e põe o Norte para cima', () => {
    const c = contornoParaSvg(quadrado, 200, 200, 10);
    expect(c).not.toBeNull();
    const numeros = (c!.d.match(/-?\d+\.\d/g) ?? []).map(Number);
    const xs = numeros.filter((_, i) => i % 2 === 0);
    const ys = numeros.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10 - 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(190 + 0.1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(190 + 0.1);
    // o primeiro ponto é lat -10 (sul), logo y maior que o do ponto lat -8 (norte)
    expect(ys[0]).toBeGreaterThan(ys[3]);
  });

  test('MultiPolygon gera um subcaminho por anel e geometria vazia devolve null', () => {
    const multi: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[-50, -10], [-48, -10], [-48, -8], [-50, -10]]],
          [[[-47, -7], [-46, -7], [-46, -6], [-47, -7]]],
        ],
      },
    };
    expect((contornoParaSvg(multi)!.d.match(/M/g) ?? []).length).toBe(2);
    expect(contornoParaSvg({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } })).toBeNull();
  });

  test('featureDaUf acha pela sigla, sem diferenciar maiúsculas', () => {
    const malha: FeatureCollection = { type: 'FeatureCollection', features: [quadrado] };
    expect(featureDaUf(malha, 'to')).toBe(quadrado);
    expect(featureDaUf(malha, 'MT')).toBeNull();
    expect(featureDaUf(null, 'TO')).toBeNull();
  });
});
