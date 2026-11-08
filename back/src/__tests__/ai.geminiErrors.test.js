jest.mock('../config/database', () => ({ sequelize: {}, models: {} }));
jest.mock('../models/ChatHistory', () => ({}));
jest.mock('../services/iagroDataContextService', () => ({ buildIagroDataContext: jest.fn() }));
jest.mock('../middleware/clerkAuth', () => ({ clerkAuth: () => (req, res, next) => next() }));

const { geminiErrorToResponse } = require('../routes/ai');

const upstream = (status) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status },
});

describe('geminiErrorToResponse', () => {
  test.each([400, 401, 402, 403, 404])('erro %i do Gemini vira 503 com mensagem amigável', (status) => {
    const r = geminiErrorToResponse(upstream(status), 'fallback');
    expect(r.status).toBe(503);
    expect(r.message).toMatch(/indisponível/);
    expect(r.message).not.toMatch(/status code/);
  });

  test('429 pede para aguardar', () => {
    expect(geminiErrorToResponse(upstream(429), 'x')).toMatchObject({ status: 503 });
    expect(geminiErrorToResponse(upstream(429), 'x').message).toMatch(/Aguarde/);
  });

  test('timeout vira 504', () => {
    const e = Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
    expect(geminiErrorToResponse(e, 'x').status).toBe(504);
  });

  test('chave ausente (503 interno) também é amigável', () => {
    const e = Object.assign(new Error('GEMINI_API_KEY não configurada'), { statusCode: 503 });
    expect(geminiErrorToResponse(e, 'x')).toMatchObject({ status: 503 });
  });

  test('erros próprios < 500 mantêm status e mensagem', () => {
    const e = Object.assign(new Error('Acesso negado a esta conversa.'), { statusCode: 403 });
    expect(geminiErrorToResponse(e, 'x')).toEqual({ status: 403, message: 'Acesso negado a esta conversa.' });
  });

  test('erro desconhecido usa a mensagem padrão com 502', () => {
    expect(geminiErrorToResponse(new Error('boom'), 'Falha padrão')).toEqual({ status: 502, message: 'Falha padrão' });
  });
});
