const request = require('supertest');
const express = require('express');

const mockRunClimateSync = jest.fn();

jest.mock('../config/database', () => ({
  sequelize: { where: jest.fn((...args) => ({ _where: args })) },
  models: {
    ClimateData: { findAll: jest.fn() },
    GeoData: {},
    OfficialAlert: {},
  },
}));

jest.mock('../services/dashboardSummaryService', () => ({
  buildDashboardSummary: jest.fn(async () => ({ kpis: [], regioes: [] })),
}));

jest.mock('../services/climateSyncService', () => ({
  runClimateSync: (...args) => mockRunClimateSync(...args),
}));

jest.mock('../services/climateAlertsUiService', () => ({}));

const SYNC_SECRET = 'segredo-de-sincronizacao-123';

describe('POST /api/climate/sync', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CLIMATE_SYNC_SECRET;
    delete process.env.NODE_ENV;
    app = express();
    app.use(express.json());
    app.use('/api/climate', require('../routes/climate'));
  });

  afterEach(() => {
    delete process.env.CLIMATE_SYNC_SECRET;
    delete process.env.NODE_ENV;
    jest.resetModules();
  });

  test('executa sync sem token quando CLIMATE_SYNC_SECRET não está configurado', async () => {
    mockRunClimateSync.mockResolvedValueOnce({ ok: true, inserted: 12, updated: 3 });

    const res = await request(app).post('/api/climate/sync');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRunClimateSync).toHaveBeenCalledTimes(1);
  });

  test('retorna ok:true com metadados de inserção quando sync bem-sucedido', async () => {
    mockRunClimateSync.mockResolvedValueOnce({
      ok: true,
      inserted: 24,
      updated: 5,
      sources: ['cptec', 'open-meteo'],
    });

    const res = await request(app).post('/api/climate/sync');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.inserted).toBe(24);
    expect(res.body.sources).toEqual(['cptec', 'open-meteo']);
  });

  test('retorna 401 quando token está ausente e CLIMATE_SYNC_SECRET está configurado', async () => {
    process.env.CLIMATE_SYNC_SECRET = SYNC_SECRET;
    jest.resetModules();
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use('/api/climate', require('../routes/climate'));

    const res = await request(freshApp).post('/api/climate/sync');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token/i);
  });

  test('retorna 401 quando token é incorreto', async () => {
    process.env.CLIMATE_SYNC_SECRET = SYNC_SECRET;
    jest.resetModules();
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use('/api/climate', require('../routes/climate'));

    const res = await request(freshApp)
      .post('/api/climate/sync')
      .set('x-climaagro-sync-token', 'token-errado');

    expect(res.status).toBe(401);
    expect(mockRunClimateSync).not.toHaveBeenCalled();
  });

  test('executa sync quando token correto é enviado', async () => {
    process.env.CLIMATE_SYNC_SECRET = SYNC_SECRET;
    jest.resetModules();
    mockRunClimateSync.mockResolvedValueOnce({ ok: true, inserted: 8 });
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use('/api/climate', require('../routes/climate'));

    const res = await request(freshApp)
      .post('/api/climate/sync')
      .set('x-climaagro-sync-token', SYNC_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRunClimateSync).toHaveBeenCalledTimes(1);
  });

  test('retorna 500 quando o serviço de sync retorna ok:false', async () => {
    mockRunClimateSync.mockResolvedValueOnce({
      ok: false,
      error: 'CPTEC API indisponível',
    });

    const res = await request(app).post('/api/climate/sync');

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/falha/i);
    expect(res.body.error).toBe('CPTEC API indisponível');
  });

  test('retorna 500 quando o serviço de sync lança exceção inesperada', async () => {
    mockRunClimateSync.mockRejectedValueOnce(new Error('Conexão recusada pelo banco'));

    const res = await request(app).post('/api/climate/sync');

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/erro/i);
  });
});
