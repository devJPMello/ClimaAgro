import { gravarDecisao, impressaoDaProposta, lerDecisoes } from './anotacaoIagro';

const proposta = { data: '2026-11-10', tipo: 'plantio' as const, observacao: ' Plantei Soja ' };

describe('anotação proposta pelo IAgro', () => {
  beforeEach(() => window.localStorage.clear());

  test('a impressão ignora maiúsculas e espaços das pontas', () => {
    expect(impressaoDaProposta(proposta)).toBe('2026-11-10|plantio|plantei soja');
  });

  test('a decisão fica gravada e é lida de novo', () => {
    expect(lerDecisoes()).toEqual({});
    gravarDecisao(proposta, 'salvo');
    expect(lerDecisoes()[impressaoDaProposta(proposta)]).toBe('salvo');
  });

  test('guarda no máximo 200 decisões', () => {
    for (let i = 0; i < 230; i += 1) gravarDecisao({ ...proposta, observacao: `n${i}` }, 'cancelado');
    expect(Object.keys(lerDecisoes()).length).toBe(200);
  });

  test('armazenamento corrompido não quebra', () => {
    window.localStorage.setItem('climaagro.iagro.diarioDecididos', '{ruim');
    expect(lerDecisoes()).toEqual({});
  });
});
