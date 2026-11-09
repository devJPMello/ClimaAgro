const request = require('supertest');
const express = require('express');

const mockFindOne = jest.fn();
const mockSendMessage = jest.fn();
const mockSendMedia = jest.fn();

jest.mock('../config/database', () => ({
  models: { DualUserProfile: { findOne: (...a) => mockFindOne(...a) } },
  sequelize: {},
}));
jest.mock('../services/evolutionService', () => ({
  sendMessage: (...a) => mockSendMessage(...a),
  sendMedia: (...a) => mockSendMedia(...a),
  isConfigured: () => true,
}));
jest.mock('../middleware/clerkAuth', () => ({
  clerkAuth: (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ message: 'Autenticação obrigatória.' });
    req.clerkUserId = id;
    return next();
  },
}));

const whatsappVerification = require('../services/whatsappVerification');

const NUMERO = '63999990000';

function perfilFake(extra = {}) {
  const p = { whatsapp: null, whatsappVerificadoEm: null, notifAlertasCriticos: true, ...extra };
  p.update = jest.fn(async (patch) => Object.assign(p, patch));
  return p;
}

describe('WhatsApp do perfil: confirmação do número e envio de relatório', () => {
  let app;
  let codigoEnviado;

  beforeEach(async () => {
    jest.clearAllMocks();
    await whatsappVerification._limparTudo();
    codigoEnviado = null;
    mockSendMessage.mockImplementation(async (numero, texto) => {
      codigoEnviado = /(\d{6})/.exec(texto)[1];
      return { sent: true };
    });
    mockSendMedia.mockResolvedValue({ sent: true });
    app = express();
    app.use(express.json());
    app.use('/api/whatsapp', require('../routes/whatsapp'));
  });

  test('sem login, tudo é recusado', async () => {
    expect((await request(app).get('/api/whatsapp/status')).status).toBe(401);
    expect((await request(app).post('/api/whatsapp/codigo').send({ whatsapp: NUMERO })).status).toBe(401);
  });

  test('status devolve o número só mascarado', async () => {
    mockFindOne.mockResolvedValue(perfilFake({ whatsapp: NUMERO, whatsappVerificadoEm: new Date() }));
    const res = await request(app).get('/api/whatsapp/status').set('x-test-user', 'u1');
    expect(res.body).toMatchObject({ verificado: true, numero: '••••••0000', alertasCriticos: true });
    expect(JSON.stringify(res.body)).not.toContain(NUMERO);
  });

  test('fluxo: pede código, erra, acerta e o número é gravado no perfil', async () => {
    const perfil = perfilFake();
    mockFindOne.mockResolvedValue(perfil);

    const pedir = await request(app).post('/api/whatsapp/codigo').set('x-test-user', 'u1').send({ whatsapp: NUMERO });
    expect(pedir.status).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(NUMERO, expect.stringContaining(codigoEnviado));

    const errado = await request(app)
      .post('/api/whatsapp/confirmar')
      .set('x-test-user', 'u1')
      .send({ codigo: codigoEnviado === '000000' ? '111111' : '000000' });
    expect(errado.status).toBe(400);
    expect(perfil.update).not.toHaveBeenCalled();

    const certo = await request(app).post('/api/whatsapp/confirmar').set('x-test-user', 'u1').send({ codigo: codigoEnviado });
    expect(certo.status).toBe(200);
    expect(perfil.update).toHaveBeenCalledWith(expect.objectContaining({ whatsapp: NUMERO, whatsappVerificadoEm: expect.any(Date) }));
  });

  test('código de um usuário não vale para outro', async () => {
    mockFindOne.mockResolvedValue(perfilFake());
    await request(app).post('/api/whatsapp/codigo').set('x-test-user', 'u1').send({ whatsapp: NUMERO });
    const res = await request(app).post('/api/whatsapp/confirmar').set('x-test-user', 'u2').send({ codigo: codigoEnviado });
    expect(res.status).toBe(400);
  });

  test('número inválido e perfil inexistente são recusados', async () => {
    const invalido = await request(app).post('/api/whatsapp/codigo').set('x-test-user', 'u1').send({ whatsapp: '123' });
    expect(invalido.status).toBe(400);
    mockFindOne.mockResolvedValue(null);
    const semPerfil = await request(app).post('/api/whatsapp/codigo').set('x-test-user', 'u1').send({ whatsapp: NUMERO });
    expect(semPerfil.status).toBe(404);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('se o WhatsApp estiver fora do ar, o código é cancelado e a resposta é 503', async () => {
    mockFindOne.mockResolvedValue(perfilFake());
    mockSendMessage.mockResolvedValue({ sent: false, reason: 'whatsapp_api_error' });
    const res = await request(app).post('/api/whatsapp/codigo').set('x-test-user', 'u1').send({ whatsapp: NUMERO });
    expect(res.status).toBe(503);
    const confirmar = await request(app).post('/api/whatsapp/confirmar').set('x-test-user', 'u1').send({ codigo: '123456' });
    expect(confirmar.body.message).toMatch(/Peça um código/);
  });

  test('remover o número limpa o perfil', async () => {
    const perfil = perfilFake({ whatsapp: NUMERO, whatsappVerificadoEm: new Date() });
    mockFindOne.mockResolvedValue(perfil);
    const res = await request(app).delete('/api/whatsapp').set('x-test-user', 'u1');
    expect(res.status).toBe(200);
    expect(perfil.update).toHaveBeenCalledWith({ whatsapp: null, whatsappVerificadoEm: null });
  });

  test('relatório: exige número confirmado e formato válido', async () => {
    mockFindOne.mockResolvedValue(perfilFake());
    const semNumero = await request(app)
      .post('/api/whatsapp/relatorio')
      .set('x-test-user', 'u1')
      .attach('file', Buffer.from('%PDF-1'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(semNumero.status).toBe(400);
    expect(semNumero.body.message).toMatch(/Confirme o seu WhatsApp/);

    mockFindOne.mockResolvedValue(perfilFake({ whatsapp: NUMERO, whatsappVerificadoEm: new Date() }));
    const formatoRuim = await request(app)
      .post('/api/whatsapp/relatorio')
      .set('x-test-user', 'u1')
      .attach('file', Buffer.from('x'), { filename: 'r.exe', contentType: 'application/x-msdownload' });
    expect(formatoRuim.status).toBe(400);
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  test('relatório: envia o arquivo ao número do próprio usuário', async () => {
    mockFindOne.mockResolvedValue(perfilFake({ whatsapp: NUMERO, whatsappVerificadoEm: new Date() }));
    const res = await request(app)
      .post('/api/whatsapp/relatorio')
      .set('x-test-user', 'u1')
      .field('titulo', 'Clima — TO')
      .field('nomeArquivo', 'relatorio-clima.pdf')
      .attach('file', Buffer.from('%PDF-1'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(mockSendMedia).toHaveBeenCalledWith(
      NUMERO,
      expect.stringContaining('Clima — TO'),
      expect.any(Buffer),
      'application/pdf',
      { fileName: 'relatorio-clima.pdf' }
    );
  });
});
