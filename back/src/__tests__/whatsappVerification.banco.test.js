// Armazenamento no banco: simula o Postgres com um Map para conferir as consultas.
const mockLinhas = new Map();
const mockQuery = jest.fn(async (sql, { replacements = {} } = {}) => {
  const k = `${replacements.userId}|${replacements.tipo}`;
  if (sql.startsWith('SELECT')) return [mockLinhas.has(k) ? [{ dados: JSON.parse(mockLinhas.get(k)) }] : []];
  if (sql.startsWith('INSERT')) {
    mockLinhas.set(k, replacements.dados);
    return [[]];
  }
  if (sql.startsWith('DELETE FROM whatsapp_verificacoes WHERE user_id')) {
    mockLinhas.delete(k);
    return [[]];
  }
  if (sql.startsWith('DELETE')) return [[]];
  throw new Error(`SQL inesperado: ${sql}`);
});
jest.mock('../config/database', () => ({ sequelize: { query: (...a) => mockQuery(...a) } }));

const wv = require('../services/whatsappVerification');

describe('códigos do WhatsApp guardados no banco', () => {
  beforeAll(() => wv._usarArmazenamento('banco'));
  afterAll(() => wv._usarArmazenamento('memoria'));
  beforeEach(() => mockLinhas.clear());

  test('código gerado continua válido mesmo após "reiniciar" (estado só no banco)', async () => {
    const { codigo } = await wv.gerarCodigo('user_a', '63999990000');
    // Nada fica em memória: o que vale é o que está na tabela.
    expect([...mockLinhas.keys()]).toEqual(['user_a|pendente']);
    expect(mockLinhas.get('user_a|pendente')).not.toContain(codigo); // só o hash é guardado

    const r = await wv.confirmarCodigo('user_a', codigo);
    expect(r).toEqual({ ok: true, numero: '63999990000' });
    expect(await wv.numeroConfirmado('user_a')).toBe('63999990000');
  });

  test('tentativas erradas são contadas no banco', async () => {
    const { codigo } = await wv.gerarCodigo('user_b', '63999990000');
    const errado = codigo === '000000' ? '111111' : '000000';
    const r1 = await wv.confirmarCodigo('user_b', errado);
    expect(r1).toMatchObject({ ok: false, motivo: 'invalido', restantes: wv.MAX_TENTATIVAS - 1 });
    expect(JSON.parse(mockLinhas.get('user_b|pendente')).tentativas).toBe(1);
  });

  test('pedir de novo antes de 1 minuto é recusado', async () => {
    await wv.gerarCodigo('user_c', '63999990000');
    const r = await wv.gerarCodigo('user_c', '63999990000');
    expect(r).toMatchObject({ ok: false, motivo: 'aguarde' });
  });
});
