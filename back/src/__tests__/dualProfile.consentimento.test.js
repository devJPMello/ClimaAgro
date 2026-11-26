const request = require('supertest');
const express = require('express');

const mockFindOne = jest.fn();
const mockCreate = jest.fn();

jest.mock('../config/database', () => ({
  models: {
    DualUserProfile: {
      findOne: (...a) => mockFindOne(...a),
      create: (...a) => mockCreate(...a),
    },
  },
  sequelize: {},
}));
jest.mock('../services/iagroMediaStorage', () => ({ deleteStoredFile: jest.fn() }));
jest.mock('../services/diarioService', () => ({ removerTodos: jest.fn() }));

const ACEITE = '2026-11-26T12:00:00.000Z';

describe('Perfil: aceite da política de privacidade no primeiro acesso', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (dados) => ({ ...dados }));
    app = express();
    app.use(express.json());
    app.use('/api/dual-profile', require('../routes/dualProfile'));
  });

  const salvar = (body) =>
    request(app).put('/api/dual-profile/me').set('x-clerk-user-id', 'user_novo').send(body);

  test('ao criar o perfil, a data do aceite é gravada', async () => {
    const res = await salvar({ uf: 'TO', municipio: 'Palmas', lgpdConsentDate: ACEITE });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ uf: 'TO', municipio: 'Palmas', lgpdConsentDate: new Date(ACEITE) })
    );
    expect(res.body.profile.lgpdConsentDate).toBe(ACEITE);
  });

  test('perfil criado sem aceite fica sem data', async () => {
    const res = await salvar({ uf: 'TO', municipio: 'Palmas' });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ lgpdConsentDate: null }));
  });
});
