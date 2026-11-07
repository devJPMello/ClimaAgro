const request = require('supertest');
const express = require('express');

const mockQuery = jest.fn();

jest.mock('../config/database', () => ({
  sequelize: { query: (...args) => mockQuery(...args) },
  models: { Productivity: {}, GeoData: {}, ClimateData: {} }
}));

jest.mock('../services/openMeteoClient', () => ({ fetchHistoricalDailyByCoords: jest.fn() }));

describe('GET /api/productivity/by-uf', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/productivity', require('../routes/productivity'));
  });

  test('exige anos válidos', async () => {
    const res = await request(app).get('/api/productivity/by-uf?years=abc');
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('agrega por UF e calcula totais ponderados', async () => {
    mockQuery.mockResolvedValueOnce([
      { state: 'MT', count: 3, sum: 12, max: 6, min_above_zero: 2, zero_count: 0 },
      { state: 'GO', count: 2, sum: 3, max: 3, min_above_zero: 3, zero_count: 1 },
    ]);
    const res = await request(app).get(
      '/api/productivity/by-uf?years=2023,2024&productLabel=Soja%20(em%20gr%C3%A3o)'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.byUf).toEqual({
      MT: { avg: 4, count: 3 },
      GO: { avg: 1.5, count: 2 },
    });
    expect(res.body.data.totals).toEqual({ count: 5, avg: 3, max: 6, minAboveZero: 2, zeroCount: 1 });

    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain('year IN (:years)');
    expect(sql).toContain('product_label = :productLabel');
    expect(opts.replacements).toMatchObject({ years: [2023, 2024], productLabel: 'Soja (em grão)' });
  });

  test('com mês filtra por period_ref de cada ano', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/productivity/by-uf?years=2024,2025&month=03&state=to');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ count: 0, avg: null, max: null, minAboveZero: null, zeroCount: 0 });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain('period_ref IN (:periods)');
    expect(opts.replacements).toMatchObject({ periods: ['2024-03', '2025-03'], state: 'TO' });
  });
});
