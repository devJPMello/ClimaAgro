const mockTabela = new Map();
const mockQuery = jest.fn(async (sql, { replacements }) => {
  if (sql.startsWith('INSERT')) {
    mockTabela.set(replacements.key, replacements.data);
    return [[], 1];
  }
  if (sql.startsWith('SELECT')) {
    const data = mockTabela.get(replacements.key);
    return [data ? [{ data }] : []];
  }
  if (sql.startsWith('DELETE')) {
    mockTabela.delete(replacements.key);
    return [[], 1];
  }
  throw new Error(`SQL inesperado: ${sql}`);
});
jest.mock('../config/database', () => ({ sequelize: { query: (...a) => mockQuery(...a) } }));

const { saveBuffer, readStoredFile, deleteStoredFile } = require('../services/iagroMediaStorage');

describe('mídia do chat com agrônomo guardada no banco', () => {
  beforeEach(() => mockTabela.clear());

  test('grava, lê de volta e apaga', async () => {
    const key = await saveBuffer(Buffer.from('conteudo-pdf'), 'application/pdf');
    expect(key).toMatch(/^hybrid-media\/[0-9a-f-]+\.pdf$/);

    const lido = await readStoredFile(key);
    expect(lido.toString()).toBe('conteudo-pdf');

    await deleteStoredFile(key);
    expect(mockTabela.has(key)).toBe(false);
  });

  test('chave fora da pasta é recusada', async () => {
    await expect(readStoredFile('../../.env')).rejects.toThrow('invalid_storage_key');
  });

  test('chave antiga sem registro no banco nem no disco dá ENOENT', async () => {
    await expect(readStoredFile('hybrid-media/nao-existe.jpg')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
