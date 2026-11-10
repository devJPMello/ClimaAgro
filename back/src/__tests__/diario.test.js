const request = require('supertest');
const express = require('express');

const mockQuery = jest.fn();
const mockSaveBuffer = jest.fn();
const mockRead = jest.fn();
const mockDelete = jest.fn();

jest.mock('../config/database', () => ({ sequelize: { query: (...a) => mockQuery(...a) }, models: {} }));
jest.mock('../services/iagroMediaStorage', () => ({
  saveBuffer: (...a) => mockSaveBuffer(...a),
  readStoredFile: (...a) => mockRead(...a),
  deleteStoredFile: (...a) => mockDelete(...a),
}));
jest.mock('../middleware/clerkAuth', () => ({
  clerkAuth: (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ message: 'Autenticação obrigatória.' });
    req.clerkUserId = id;
    return next();
  },
}));

const diario = require('../services/diarioService');

const AGORA = new Date('2026-11-10T12:00:00Z');

describe('validarEntrada', () => {
  const base = { data: '2026-11-01', tipo: 'plantio', uf: 'mt', cultura: ' Soja ', observacao: ' semeadura ' };

  test('aceita e normaliza', () => {
    const { valor, erro } = diario.validarEntrada(base, AGORA);
    expect(erro).toBeUndefined();
    expect(valor).toMatchObject({ data: '2026-11-01', tipo: 'plantio', uf: 'MT', cultura: 'Soja', observacao: 'semeadura', municipio: null });
  });

  test.each([
    [{ ...base, data: '2026-13-40' }, /data/i],
    [{ ...base, data: '2027-01-01' }, /futuro/i],
    [{ ...base, tipo: 'outro' }, /tipo/i],
    [{ ...base, uf: 'M' }, /UF/],
  ])('recusa %#', (corpo, mensagem) => {
    expect(diario.validarEntrada(corpo, AGORA).erro).toMatch(mensagem);
  });
});

describe('contextoClimatico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[{ temp: '27.44', chuva: '31.26', dias_chuva: '3', dias: '7' }]]);
  });

  test('semana de antes e de depois, limitando o depois a hoje', async () => {
    const r = await diario.contextoClimatico('MT', '2026-11-08', AGORA);
    expect(r.antes).toEqual({ dias: 7, chuvaMm: 31.3, tempMedia: 27.4, diasComChuva: 3 });
    const janelaDepois = mockQuery.mock.calls[1][1].replacements;
    expect(janelaDepois).toMatchObject({ uf: 'MT', inicio: '2026-11-09', fim: '2026-11-10' });
  });

  test('registro de hoje ainda não tem semana de depois', async () => {
    const r = await diario.contextoClimatico('MT', '2026-11-10', AGORA);
    expect(r.depois).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('sem dados de clima no período devolve valores nulos', async () => {
    mockQuery.mockResolvedValue([[{ temp: null, chuva: null, dias_chuva: '0', dias: '0' }]]);
    const r = await diario.contextoClimatico('MT', '2020-01-10', AGORA);
    expect(r.antes).toEqual({ dias: 0, chuvaMm: null, tempMedia: null, diasComChuva: null });
  });
});

describe('rotas /api/diario', () => {
  let app;
  let registros;

  beforeEach(() => {
    jest.clearAllMocks();
    registros = [];
    mockSaveBuffer.mockImplementation(async () => `hybrid-media/${registros.length}-${Math.random()}.jpg`);
    mockDelete.mockResolvedValue();
    mockQuery.mockImplementation(async (sql, { replacements } = {}) => {
      if (sql.startsWith('INSERT')) {
        registros.push({
          id: replacements.id,
          user_id: replacements.userId,
          data: replacements.data,
          tipo: replacements.tipo,
          cultura: replacements.cultura,
          uf: replacements.uf,
          municipio: replacements.municipio,
          observacao: replacements.observacao,
          attachments: JSON.parse(replacements.anexos),
          created_at: new Date().toISOString(),
        });
        return [[]];
      }
      if (sql.includes('COUNT(*)::int')) return [[{ n: registros.filter((r) => r.user_id === replacements.userId).length }]];
      if (sql.startsWith('DELETE')) {
        const i = registros.findIndex((r) => r.user_id === replacements.userId && r.id === replacements.id);
        if (i < 0) return [[]];
        const [removido] = registros.splice(i, 1);
        return [[{ attachments: removido.attachments }]];
      }
      if (sql.includes('LIMIT 1')) {
        return [registros.filter((r) => r.user_id === replacements.userId && r.id === replacements.id)];
      }
      return [registros.filter((r) => r.user_id === replacements.userId)];
    });
    app = express();
    app.use(express.json());
    app.use('/api/diario', require('../routes/diario'));
  });

  const novo = (usuario = 'u1') =>
    request(app)
      .post('/api/diario')
      .set('x-test-user', usuario)
      .field('data', '2026-11-01')
      .field('tipo', 'aplicacao')
      .field('uf', 'MT')
      .field('cultura', 'Soja')
      .field('observacao', 'Aplicação preventiva');

  test('exige login', async () => {
    expect((await request(app).get('/api/diario')).status).toBe(401);
  });

  test('cria um registro com foto e lista só os do próprio usuário', async () => {
    const criado = await novo().attach('files', Buffer.from('x'), { filename: 'f.jpg', contentType: 'image/jpeg' });
    expect(criado.status).toBe(201);
    expect(mockSaveBuffer).toHaveBeenCalledTimes(1);

    const meus = await request(app).get('/api/diario').set('x-test-user', 'u1');
    expect(meus.body.registros).toHaveLength(1);
    expect(meus.body.registros[0]).toMatchObject({ tipo: 'aplicacao', uf: 'MT', anexos: [{ nome: 'f.jpg', tipo: 'image/jpeg' }] });
    expect(JSON.stringify(meus.body)).not.toContain('hybrid-media');

    const deOutro = await request(app).get('/api/diario').set('x-test-user', 'u2');
    expect(deOutro.body.registros).toHaveLength(0);
  });

  test('recusa arquivo que não é foto e dados inválidos', async () => {
    const pdf = await novo().attach('files', Buffer.from('x'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    expect(mockSaveBuffer).not.toHaveBeenCalled();

    const semData = await request(app).post('/api/diario').set('x-test-user', 'u1').field('tipo', 'plantio').field('uf', 'MT');
    expect(semData.status).toBe(400);
  });

  test('mais de 3 fotos é recusado', async () => {
    let req = novo();
    for (let i = 0; i < 4; i += 1) req = req.attach('files', Buffer.from('x'), { filename: `f${i}.jpg`, contentType: 'image/jpeg' });
    expect((await req).status).toBe(400);
  });

  test('apagar remove o registro e as fotos; outro usuário não consegue', async () => {
    await novo().attach('files', Buffer.from('x'), { filename: 'f.jpg', contentType: 'image/jpeg' });
    const id = registros[0].id;

    expect((await request(app).delete(`/api/diario/${id}`).set('x-test-user', 'u2')).status).toBe(404);
    expect(registros).toHaveLength(1);

    expect((await request(app).delete(`/api/diario/${id}`).set('x-test-user', 'u1')).status).toBe(200);
    expect(registros).toHaveLength(0);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  test('foto só é servida ao dono', async () => {
    await novo().attach('files', Buffer.from('x'), { filename: 'f.jpg', contentType: 'image/jpeg' });
    const id = registros[0].id;
    mockRead.mockResolvedValue(Buffer.from('imagem'));

    const dono = await request(app).get(`/api/diario/${id}/anexo/0`).set('x-test-user', 'u1');
    expect(dono.status).toBe(200);
    expect(dono.headers['content-type']).toContain('image/jpeg');

    expect((await request(app).get(`/api/diario/${id}/anexo/0`).set('x-test-user', 'u2')).status).toBe(404);
    expect((await request(app).get(`/api/diario/${id}/anexo/9`).set('x-test-user', 'u1')).status).toBe(404);
  });
});
