const request = require('supertest');
const express = require('express');

const mockFindOne = jest.fn();
const mockFindAll = jest.fn();
const mockCreate = jest.fn();
const mockSend = jest.fn();

jest.mock('../models/DualUserProfile', () => ({
  findOne: (...a) => mockFindOne(...a),
  findAll: (...a) => mockFindAll(...a),
  create: (...a) => mockCreate(...a),
}));
jest.mock('../services/evolutionService', () => ({ sendMessage: (...a) => mockSend(...a) }));
// Login simulado: o usuário vem do cabeçalho de teste.
jest.mock('../middleware/clerkAuth', () => ({
  clerkAuth: (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ message: 'Autenticação obrigatória.' });
    req.clerkUserId = id;
    return next();
  },
}));

const whatsappVerification = require('../services/whatsappVerification');

const CPF_VALIDO = '52998224725';
const corpo = {
  nome: 'Ana Agrônoma',
  email: 'ana@exemplo.com',
  cpf: CPF_VALIDO,
  whatsapp: '63999990000',
  uf: 'TO',
  municipio: 'Palmas',
  crea: 'TO-12345',
  especialidade: 'Soja e Milho',
};

describe('cadastro de agrônomo ligado à conta e WhatsApp confirmado', () => {
  let app;
  let codigoEnviado;

  beforeEach(() => {
    jest.clearAllMocks();
    whatsappVerification._limparTudo();
    delete process.env.CLERK_SECRET_KEY;
    codigoEnviado = null;
    mockSend.mockImplementation(async (numero, texto) => {
      codigoEnviado = /(\d{6})/.exec(texto)[1];
      return { sent: true };
    });
    app = express();
    app.use(express.json());
    app.use('/api/agronomos-parceiros', require('../routes/agronomosParceiros'));
  });

  test('sem login, o cadastro é recusado', async () => {
    const res = await request(app).post('/api/agronomos-parceiros/cadastro').send(corpo);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('sem confirmar o WhatsApp, o cadastro é recusado', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/agronomos-parceiros/cadastro')
      .set('x-test-user', 'user_a')
      .send(corpo);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Confirme o seu WhatsApp/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('fluxo completo: pede código, confirma e salva como pendente', async () => {
    const enviar = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    expect(enviar.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith('63999990000', expect.stringContaining(codigoEnviado));

    const errado = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/confirmar')
      .set('x-test-user', 'user_a')
      .send({ codigo: codigoEnviado === '000000' ? '111111' : '000000' });
    expect(errado.status).toBe(400);
    expect(errado.body.message).toMatch(/incorreto/);

    const certo = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/confirmar')
      .set('x-test-user', 'user_a')
      .send({ codigo: codigoEnviado });
    expect(certo.status).toBe(200);

    mockFindOne.mockResolvedValue(null);
    const salvar = await request(app)
      .post('/api/agronomos-parceiros/cadastro')
      .set('x-test-user', 'user_a')
      .send(corpo);
    expect(salvar.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_a',
        whatsapp: '63999990000',
        parceiroAtivo: false,
        whatsappVerificadoEm: expect.any(Date),
      })
    );
  });

  test('código de um usuário não vale para outro', async () => {
    await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    const res = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/confirmar')
      .set('x-test-user', 'user_b')
      .send({ codigo: codigoEnviado });
    expect(res.status).toBe(400);
  });

  test('não deixa usar o e-mail de outra pessoa', async () => {
    // Confirma o número direto pelo serviço.
    const { codigo } = whatsappVerification.gerarCodigo('user_a', '63999990000');
    whatsappVerification.confirmarCodigo('user_a', codigo);

    mockFindOne
      .mockResolvedValueOnce(null) // perfil do usuário logado
      .mockResolvedValueOnce({ id: 'outro', clerkUserId: 'user_x' }); // dono do e-mail
    const res = await request(app)
      .post('/api/agronomos-parceiros/cadastro')
      .set('x-test-user', 'user_a')
      .send(corpo);
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('se o WhatsApp não envia, o código é descartado e avisa o usuário', async () => {
    mockSend.mockResolvedValueOnce({ sent: false, reason: 'whatsapp_not_configured' });
    const res = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    expect(res.status).toBe(503);
    // Pode pedir de novo logo em seguida, sem esperar o intervalo.
    const de_novo = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    expect(de_novo.status).toBe(200);
  });

  test('pedir código duas vezes seguidas exige esperar', async () => {
    await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    const res = await request(app)
      .post('/api/agronomos-parceiros/whatsapp/codigo')
      .set('x-test-user', 'user_a')
      .send({ whatsapp: corpo.whatsapp });
    expect(res.status).toBe(429);
  });
});
