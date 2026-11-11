jest.mock('../config/database', () => ({ sequelize: { query: jest.fn() }, models: {} }));

const { instrucaoDiario, removerMarcador, extrairAnotacao, hojeBrasilia } = require('../services/iagroDiarioService');

const HOJE = '2026-11-10';
const CTX = { hoje: HOJE, ufPerfil: 'TO', municipioPerfil: 'Palmas' };
const marcador = (obj) => `[[DIARIO:${JSON.stringify(obj)}]]`;

describe('anotação do Diário de Campo pelo IAgro', () => {
  test('separa o texto da anotação e completa UF e município com o perfil', () => {
    const resposta = `Vou anotar o plantio da soja. Confirme no cartão abaixo.\n\n${marcador({
      tipo: 'plantio', data: '2026-11-09', cultura: 'soja', municipio: '', observacao: 'Plantei soja no talhão 1',
    })}`;
    const { texto, anotacao } = extrairAnotacao(resposta, CTX);
    expect(texto).toBe('Vou anotar o plantio da soja. Confirme no cartão abaixo.');
    expect(anotacao).toEqual({
      data: '2026-11-09', tipo: 'plantio', cultura: 'soja', uf: 'TO', municipio: 'Palmas', observacao: 'Plantei soja no talhão 1',
    });
  });

  test('tipo desconhecido vira observação; data inválida ou futura vira hoje', () => {
    const a = extrairAnotacao(marcador({ tipo: 'xyz', data: '2027-01-01', observacao: 'algo' }), CTX).anotacao;
    expect(a).toMatchObject({ tipo: 'observacao', data: HOJE });
    const b = extrairAnotacao(marcador({ tipo: 'colheita', data: 'ontem', observacao: 'algo' }), CTX).anotacao;
    expect(b).toMatchObject({ tipo: 'colheita', data: HOJE });
  });

  test('sem observação, JSON quebrado ou sem marcador não gera anotação (e o texto fica limpo)', () => {
    expect(extrairAnotacao(marcador({ tipo: 'plantio', observacao: '  ' }), CTX).anotacao).toBeNull();
    const quebrado = extrairAnotacao('Oi [[DIARIO:{tipo: plantio}]]', CTX);
    expect(quebrado.anotacao).toBeNull();
    expect(quebrado.texto).toBe('Oi');
    expect(extrairAnotacao('Resposta normal.', CTX)).toEqual({ texto: 'Resposta normal.', anotacao: null });
  });

  test('perfil sem UF deixa a UF em branco para o usuário escolher no cartão', () => {
    const a = extrairAnotacao(marcador({ tipo: 'adubacao', observacao: 'adubei' }), { hoje: HOJE }).anotacao;
    expect(a.uf).toBe('');
  });

  test('removerMarcador limpa o texto usado como contexto do modelo', () => {
    expect(removerMarcador(`Anotado.\n\n${marcador({ observacao: 'x' })}`)).toBe('Anotado.');
  });

  test('a instrução ao modelo traz a data de hoje, os tipos aceitos e a regra de só agir a pedido', () => {
    const t = instrucaoDiario(HOJE);
    expect(t).toContain(HOJE);
    expect(t).toContain('praga_doenca');
    expect(t).toMatch(/somente quando/);
    expect(hojeBrasilia(new Date('2026-11-10T02:00:00Z'))).toBe('2026-11-09'); // ainda é dia 9 em Brasília
  });
});
