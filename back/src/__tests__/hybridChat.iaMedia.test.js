const request = require('supertest');
const express = require('express');

const mockChatHistoryFindOne = jest.fn();
const mockReadStoredFile = jest.fn();

jest.mock('../models/ChatHistory', () => ({
  findOne: (...args) => mockChatHistoryFindOne(...args),
  findAll: jest.fn(),
}));
jest.mock('../models/HybridConversation', () => ({}));
jest.mock('../models/HybridMessage', () => ({}));
jest.mock('../models/DualUserProfile', () => ({}));
jest.mock('../services/evolutionService', () => ({}));
jest.mock('../services/hybridMediaStorage', () => ({
  readStoredFile: (...args) => mockReadStoredFile(...args),
  saveBuffer: jest.fn(),
  deleteStoredFile: jest.fn(),
}));
jest.mock('../middleware/clerkAuth', () => ({
  clerkAuth: (req, res, next) => {
    const userId = String(req.headers['x-clerk-user-id'] || '').trim();
    if (!userId) return res.status(401).json({ message: 'Autenticação obrigatória.' });
    req.clerkUserId = userId;
    next();
  },
}));

const DONO = 'user_dono';
const CHAT_ID = '6f1c2b1e-0000-4000-8000-000000000001';

describe('GET /api/hybrid-chat/ia-media/:chatId/:index (anexos do IAgro)', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use('/api/hybrid-chat', require('../routes/hybridChat'));
  });
  beforeEach(() => {
    mockChatHistoryFindOne.mockReset();
    mockReadStoredFile.mockReset();
  });

  test('dono recebe o ficheiro com o tipo certo', async () => {
    mockChatHistoryFindOne.mockResolvedValue({
      id: CHAT_ID,
      attachments: [{ key: 'hybrid-media/a.pdf', mime: 'application/pdf', name: 'solo.pdf' }],
    });
    mockReadStoredFile.mockResolvedValue(Buffer.from('%PDF-teste'));

    const res = await request(app).get(`/api/hybrid-chat/ia-media/${CHAT_ID}/0`).set('X-Clerk-User-Id', DONO);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(mockChatHistoryFindOne.mock.calls[0][0].where).toMatchObject({ id: CHAT_ID, clerkUserId: DONO });
  });

  test('outro usuário não encontra a mensagem (404)', async () => {
    mockChatHistoryFindOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/hybrid-chat/ia-media/${CHAT_ID}/0`).set('X-Clerk-User-Id', 'outro');
    expect(res.status).toBe(404);
    expect(mockReadStoredFile).not.toHaveBeenCalled();
  });

  test('índice inexistente dá 404', async () => {
    mockChatHistoryFindOne.mockResolvedValue({ id: CHAT_ID, attachments: [] });
    const res = await request(app).get(`/api/hybrid-chat/ia-media/${CHAT_ID}/3`).set('X-Clerk-User-Id', DONO);
    expect(res.status).toBe(404);
  });

  test('sem login dá 401', async () => {
    const res = await request(app).get(`/api/hybrid-chat/ia-media/${CHAT_ID}/0`);
    expect(res.status).toBe(401);
  });
});
