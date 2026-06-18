const request = require('supertest');
const express = require('express');

const mockFindAll = jest.fn();
const mockCreate = jest.fn();

jest.mock('../config/database', () => ({
  models: {
    ReportExport: {
      findAll: (...args) => mockFindAll(...args),
      create: (...args) => mockCreate(...args),
    },
  },
}));

const CLIENT_ID = 'cliente-uuid-valido-abcd-5678';

const validBody = {
  tipo: 'Clima',
  local: 'Tocantins',
  periodo: 'Janeiro/2026',
  formato: 'pdf',
};

function makeRow(overrides = {}) {
  return {
    id: 'rpt-uuid-001',
    reportTypeLabel: 'Clima',
    localityLabel: 'Tocantins',
    periodLabel: 'Janeiro/2026',
    format: 'pdf',
    status: 'registrado',
    generatedWithAi: false,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('reports/exports routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/reports', require('../routes/reports'));
  });

  // ─── GET /api/reports/exports ───────────────────────────────────────────────

  describe('GET /api/reports/exports', () => {
    test('rejeita requisição sem cabeçalho X-Export-Client-Id', async () => {
      const res = await request(app).get('/api/reports/exports');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejeita cabeçalho com menos de 8 caracteres', async () => {
      const res = await request(app)
        .get('/api/reports/exports')
        .set('X-Export-Client-Id', 'curto');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('retorna lista vazia quando cliente não tem exportações', async () => {
      mockFindAll.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientKey: CLIENT_ID } })
      );
    });

    test('retorna exportações mapeadas no formato DTO correto', async () => {
      mockFindAll.mockResolvedValueOnce([
        makeRow({ id: 'rpt-001', format: 'pdf', status: 'concluido', generatedWithAi: false }),
        makeRow({ id: 'rpt-002', format: 'csv', status: 'processando', generatedWithAi: true }),
      ]);

      const res = await request(app)
        .get('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);

      const [item1, item2] = res.body.items;
      expect(item1.id).toBe('rpt-001');
      expect(item1.tipo).toBe('Clima');
      expect(item1.local).toBe('Tocantins');
      expect(item1.formato).toBe('PDF'); // uppercase
      expect(item1.status).toBe('concluido');
      expect(item1.foiGeradoComIA).toBe(false);

      expect(item2.formato).toBe('CSV');
      expect(item2.foiGeradoComIA).toBe(true);
    });
  });

  // ─── POST /api/reports/exports ──────────────────────────────────────────────

  describe('POST /api/reports/exports', () => {
    test('rejeita sem X-Export-Client-Id', async () => {
      const res = await request(app)
        .post('/api/reports/exports')
        .send(validBody);
      expect(res.status).toBe(400);
    });

    test('rejeita quando "tipo" está ausente no corpo', async () => {
      const { tipo, ...semTipo } = validBody;
      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send(semTipo);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejeita quando "local" está ausente no corpo', async () => {
      const { local, ...semLocal } = validBody;
      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send(semLocal);
      expect(res.status).toBe(400);
    });

    test('rejeita status inválido', async () => {
      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send({ ...validBody, status: 'invalido' });
      expect(res.status).toBe(400);
    });

    test('cria exportação com status padrão "registrado" quando omitido', async () => {
      mockCreate.mockResolvedValueOnce(makeRow({ id: 'rpt-novo', status: 'registrado' }));

      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.item.id).toBe('rpt-novo');
      expect(res.body.item.status).toBe('registrado');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          clientKey: CLIENT_ID,
          reportTypeLabel: 'Clima',
          localityLabel: 'Tocantins',
          periodLabel: 'Janeiro/2026',
          status: 'registrado',
          generatedWithAi: false,
        })
      );
    });

    test('cria exportação com status "processando" explícito', async () => {
      mockCreate.mockResolvedValueOnce(makeRow({ id: 'rpt-proc', status: 'processando' }));

      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send({ ...validBody, status: 'processando' });

      expect(res.status).toBe(201);
      expect(res.body.item.status).toBe('processando');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processando' })
      );
    });

    test('persiste foiGeradoComIA como verdadeiro', async () => {
      mockCreate.mockResolvedValueOnce(makeRow({ id: 'rpt-ai', generatedWithAi: true }));

      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send({ ...validBody, foiGeradoComIA: true });

      expect(res.status).toBe(201);
      expect(res.body.item.foiGeradoComIA).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ generatedWithAi: true })
      );
    });

    test('formato é persistido em minúsculo e retornado em maiúsculo no DTO', async () => {
      mockCreate.mockResolvedValueOnce(makeRow({ id: 'rpt-fmt', format: 'excel' }));

      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send({ ...validBody, formato: 'EXCEL' });

      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'excel' })
      );
      expect(res.body.item.formato).toBe('EXCEL');
    });

    test('retorna 500 quando banco lança exceção', async () => {
      mockCreate.mockRejectedValueOnce(new Error('unique constraint violated'));

      const res = await request(app)
        .post('/api/reports/exports')
        .set('X-Export-Client-Id', CLIENT_ID)
        .send(validBody);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
