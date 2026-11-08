const request = require('supertest');
const express = require('express');

const mockFindAll = jest.fn();

jest.mock('../models/DualUserProfile', () => ({
  findAll: (...args) => mockFindAll(...args),
}));

describe('GET /api/agronomos-parceiros', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindAll.mockResolvedValue([]);
    app = express();
    app.use('/api/agronomos-parceiros', require('../routes/agronomosParceiros'));
  });

  test('lista só parceiros ativos por padrão', async () => {
    const res = await request(app).get('/api/agronomos-parceiros');
    expect(res.status).toBe(200);
    expect(mockFindAll.mock.calls[0][0].where).toMatchObject({ parceiroAtivo: true });
  });

  test.each(['false', '0', 'todos'])('ignora ativo=%s e não expõe pendentes', async (valor) => {
    const res = await request(app).get(`/api/agronomos-parceiros?ativo=${valor}`);
    expect(res.status).toBe(200);
    expect(mockFindAll.mock.calls[0][0].where).toMatchObject({ parceiroAtivo: true });
  });
});
