const request = require('supertest');
const express = require('express');

const mockFindAll = jest.fn();

jest.mock('../config/database', () => ({
  sequelize: { where: jest.fn((...args) => ({ _where: args })) },
  models: {
    ClimateData: { findAll: (...args) => mockFindAll(...args) },
    GeoData: {},
    OfficialAlert: {}
  }
}));

jest.mock('../services/dashboardSummaryService', () => ({
  buildDashboardSummary: jest.fn(async () => ({ kpis: [], regioes: [] }))
}));

jest.mock('../services/climateSyncService', () => ({
  runClimateSync: jest.fn(async () => ({ ok: true }))
}));

jest.mock('../services/climateAlertsUiService', () => ({}));

describe('climate routes - uf series', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/climate', require('../routes/climate'));
  });

  test('valida UF inválida', async () => {
    const res = await request(app).get('/api/climate/series?uf=XX&start=2020-01-01&end=2020-01-31&variavel=precipitacao');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('retorna agregado ALL com estatísticas', async () => {
    mockFindAll.mockResolvedValueOnce([
      { date: '2020-01-01', uf: 'SP', value: '10.5' },
      { date: '2020-01-02', uf: 'RJ', value: '20.5' }
    ]);
    const res = await request(app).get('/api/climate/series?uf=ALL&start=2020-01-01&end=2020-01-31&variavel=precipitacao');
    expect(res.status).toBe(200);
    expect(res.body.metadata.uf).toBe('ALL');
    expect(res.body.estatisticas.media).toBe(15.5);
    expect(res.body.serieTemporal).toHaveLength(2);
  });
});
