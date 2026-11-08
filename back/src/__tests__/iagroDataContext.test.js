jest.mock('../config/database', () => ({ models: {}, sequelize: {} }));
jest.mock('../services/climateAlertsUiService', () => ({}));

const { _internos } = require('../services/iagroDataContextService');
const { agruparAlertas, nomeCultura, mesAno } = _internos;

describe('resumo de dados enviado ao IAgro', () => {
  test('nome da cultura sem o código do IBGE', () => {
    expect(nomeCultura('1.17 soja')).toBe('Soja');
    expect(nomeCultura('1.16 milho (2ª safra)')).toBe('Milho (2ª safra)');
    expect(nomeCultura('12 castanha-de-caju')).toBe('Castanha-de-caju');
  });

  test('período legível', () => {
    expect(mesAno('2026-09')).toBe('set/2026');
  });

  test('alertas repetidos viram uma linha com quantidade, período e severidade máxima', () => {
    const linhas = agruparAlertas([
      { tipo: 'Tempestade', data: '06/11/2026', severidade: 'medium', valorAtual: 'Aviso A' },
      { tipo: 'Tempestade', data: '08/11/2026', severidade: 'high', valorAtual: 'Aviso B' },
      { tipo: 'Tempestade', data: '05/11/2026', severidade: 'medium', valorAtual: 'Aviso C' },
      { tipo: 'Chuvas Intensas', data: '05/11/2026', severidade: 'medium', valorAtual: 'Aviso D' },
    ]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toBe('- Tempestade (3 avisos, 05/11 a 08/11, severidade máxima alta): Aviso B');
    expect(linhas[1]).toBe('- Chuvas Intensas (1 aviso, 05/11/2026, severidade máxima média): Aviso D');
  });
});
