const request = require('supertest');
const express = require('express');

// ── Mocks declarados antes dos jest.mock() ──────────────────────────────────

const mockChatHistoryFindOne = jest.fn();
const mockChatHistoryFindAll = jest.fn();
const mockConversationFindOrCreate = jest.fn();
const mockDualProfileFindOne = jest.fn();
const mockEvolutionSendMessage = jest.fn();

jest.mock('../models/ChatHistory', () => ({
  findOne: (...args) => mockChatHistoryFindOne(...args),
  findAll: (...args) => mockChatHistoryFindAll(...args),
}));

jest.mock('../models/HybridConversation', () => ({
  findOrCreate: (...args) => mockConversationFindOrCreate(...args),
}));

jest.mock('../models/HybridMessage', () => ({}));

jest.mock('../models/DualUserProfile', () => ({
  findOne: (...args) => mockDualProfileFindOne(...args),
}));

jest.mock('../services/evolutionService', () => ({
  sendMessage: (...args) => mockEvolutionSendMessage(...args),
}));

jest.mock('../services/hybridMediaStorage', () => ({
  readStoredFile: jest.fn(),
  saveBuffer: jest.fn(),
}));

// Substitui o middleware de auth por uma versão simples de teste:
// aceita X-Clerk-User-Id header sem verificação JWT.
jest.mock('../middleware/clerkAuth', () => ({
  clerkAuth: (req, res, next) => {
    const userId = String(req.headers['x-clerk-user-id'] || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Autenticação obrigatória.' });
    }
    req.clerkUserId = userId;
    next();
  },
}));

// ── Constantes de teste ─────────────────────────────────────────────────────

const PROD_ID = 'user_produtor_test_abc123';
const THREAD_ID = 'thread_soja_praga_001';
const WHATSAPP = '5562999991234';
const AGR_ID = 'agr-uuid-123';

// Agrônomo parceiro ativo cadastrado na base e perfil do produtor (para o "Local").
const agronomoAtivo = { id: AGR_ID, nome: 'Dr. Teste', especialidade: 'Soja e Milho', whatsapp: WHATSAPP };
const perfilProdutor = { clerkUserId: PROD_ID, municipio: 'Palmas', uf: 'TO' };

const fakeMensagemIA = {
  threadId: THREAD_ID,
  clerkUserId: PROD_ID,
  isActive: true,
  status: 'success',
  message: 'Tenho lagartas na lavoura de soja e as folhas estão sendo destruídas.',
  response: 'Recomendo aplicação de Dipel (Bacillus thuringiensis) a 1 g/L. Verifique o estágio larval.',
  createdAt: new Date('2026-01-10T08:00:00Z'),
};

function makeMockConversation(overrides = {}) {
  const conv = {
    id: 'conv-uuid-001',
    whatsappAgronomo: WHATSAPP,
    agronomoParceiroId: null,
    produtorNomeSnapshot: null,
    casoResumoSnapshot: null,
    atendimentoAtivo: true,
    intervencaoHumana: true,
    ...overrides,
  };
  conv.update = jest.fn(async function (values) {
    Object.assign(this, values);
    return this;
  });
  return conv;
}

// ── Testes ──────────────────────────────────────────────────────────────────

describe('POST /api/hybrid-chat/escalate', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDualProfileFindOne.mockReset();
    mockDualProfileFindOne.mockImplementation(async ({ where }) => {
      if (where.id === AGR_ID) return agronomoAtivo;
      if (where.clerkUserId) return perfilProdutor;
      return null;
    });
    app = express();
    app.use(express.json());
    app.use('/api/hybrid-chat', require('../routes/hybridChat'));
  });

  // ── Validação de entrada ─────────────────────────────────────────────────

  test('retorna 401 sem autenticação (sem X-Clerk-User-Id)', async () => {
    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .send({ threadId: THREAD_ID, whatsappAgronomo: WHATSAPP });

    expect(res.status).toBe(401);
  });

  test('retorna 400 quando threadId está ausente', async () => {
    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ whatsappAgronomo: WHATSAPP });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/threadId/i);
  });

  test('retorna 400 quando threadId é string vazia', async () => {
    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: '   ', whatsappAgronomo: WHATSAPP });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/threadId/i);
  });

  // ── Validação do histórico IA ────────────────────────────────────────────

  test('retorna 400 quando não há mensagens da IA no tópico', async () => {
    // findOne = null → sem conflito de acesso (thread disponível)
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    // findAll = [] → thread existe mas sem mensagens
    mockChatHistoryFindAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: THREAD_ID, whatsappAgronomo: WHATSAPP });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/não há mensagens/i);
    expect(mockEvolutionSendMessage).not.toHaveBeenCalled();
  });

  // ── Escalada com whatsapp explícito ──────────────────────────────────────

  test('retorna 200 com waUrl, conversationId e summary em escalada bem-sucedida', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const mockConv = makeMockConversation();
    mockConversationFindOrCreate.mockResolvedValueOnce([mockConv, true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ messageId: 'wamsg_001' });

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        agronomoParceiroId: AGR_ID,
        produtorNome: 'João da Silva',
        casoDestaque: 'Lagarta do cartucho na soja — 3º instar larval',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conversationId).toBe('conv-uuid-001');
    expect(res.body.waUrl).toContain(`wa.me/${WHATSAPP}`);
    expect(res.body.intervencaoHumana).toBe(true);
    expect(res.body.atendimentoAtivo).toBe(true);
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.summary).toContain('João da Silva');
    expect(mockEvolutionSendMessage).toHaveBeenCalledTimes(1);
  });

  test('summary gerado inclui trecho do histórico IA', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const mockConv = makeMockConversation();
    mockConversationFindOrCreate.mockResolvedValueOnce([mockConv, true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ messageId: 'wamsg_002' });

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        agronomoParceiroId: AGR_ID,
        produtorNome: 'Maria Produtora',
      });

    expect(res.status).toBe(200);
    // O body do WhatsApp deve mencionar o histórico
    expect(res.body.summary).toContain('Produtor');
    expect(res.body.summary).toContain('IAgro');
  });

  test('HybridConversation é criada/atualizada com flags corretas', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const mockConv = makeMockConversation();
    mockConversationFindOrCreate.mockResolvedValueOnce([mockConv, true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ messageId: 'wamsg_003' });

    await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        agronomoParceiroId: AGR_ID,
        produtorNome: 'Carlos Fazendeiro',
      });

    expect(mockConversationFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { produtorClerkId: PROD_ID, iaThreadId: THREAD_ID },
        defaults: expect.objectContaining({
          atendimentoAtivo: true,
          intervencaoHumana: true,
        }),
      })
    );
    expect(mockConv.update).toHaveBeenCalledWith(
      expect.objectContaining({ atendimentoAtivo: true, intervencaoHumana: true })
    );
  });

  // ── Auto-pick por especialidade ──────────────────────────────────────────

  test('auto-pick: encontra agrônomo e retorna nome e especialidade', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const agronomo = {
      id: 'agr-uuid-999',
      nome: 'Dra. Ana Fitossanitária',
      especialidade: 'Pragas',
      whatsapp: WHATSAPP,
    };
    // DualUserProfile.findOne é chamado para cada sinônimo; retorna na primeira chamada
    mockDualProfileFindOne.mockResolvedValue(agronomo);

    const mockConv = makeMockConversation({ agronomoParceiroId: 'agr-uuid-999' });
    mockConversationFindOrCreate.mockResolvedValueOnce([mockConv, true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ messageId: 'wamsg_004' });

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        produtorNome: 'Pedro Produtor',
        specialtyFilter: 'praga',
        autoPickBySpecialty: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.agronomoNome).toBe('Dra. Ana Fitossanitária');
    expect(res.body.agronomoEspecialidade).toBe('Pragas');
    expect(res.body.waUrl).toContain(WHATSAPP);
    // Deve ter buscado agrônomo por especialidade
    expect(mockDualProfileFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipo: 'agronomo', parceiro: true, parceiroAtivo: true }),
      })
    );
  });

  test('auto-pick: retorna 404 quando nenhum agrônomo está disponível para a especialidade', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);
    // Nenhum agrônomo encontrado para nenhum sinônimo
    mockDualProfileFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        produtorNome: 'Pedro Produtor',
        specialtyFilter: 'irrigacao',
        autoPickBySpecialty: true,
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/nenhum agrônomo/i);
    expect(mockEvolutionSendMessage).not.toHaveBeenCalled();
  });

  // ── Segurança do destino e local do produtor ─────────────────────────────

  test('ignora número enviado pelo navegador e usa o WhatsApp do agrônomo cadastrado', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);
    mockConversationFindOrCreate.mockResolvedValueOnce([makeMockConversation(), true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ sent: true });

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: THREAD_ID, agronomoParceiroId: AGR_ID, whatsappAgronomo: '5511900000000' });

    expect(res.status).toBe(200);
    expect(mockEvolutionSendMessage).toHaveBeenCalledWith(WHATSAPP, expect.any(String));
    expect(mockEvolutionSendMessage).not.toHaveBeenCalledWith('5511900000000', expect.anything());
  });

  test('só com um número qualquer (sem agrônomo da base) não envia nada', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: THREAD_ID, whatsappAgronomo: '5511900000000' });

    expect(res.status).toBe(400);
    expect(mockEvolutionSendMessage).not.toHaveBeenCalled();
  });

  test('agrônomo inexistente ou inativo retorna 404 e não envia', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: THREAD_ID, agronomoParceiroId: 'agr-inativo' });

    expect(res.status).toBe(404);
    expect(mockEvolutionSendMessage).not.toHaveBeenCalled();
  });

  test('resumo enviado ao agrônomo traz o município e o estado do produtor', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);
    mockConversationFindOrCreate.mockResolvedValueOnce([makeMockConversation(), true]);
    mockEvolutionSendMessage.mockResolvedValueOnce({ sent: true });

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({ threadId: THREAD_ID, agronomoParceiroId: AGR_ID, produtorNome: 'Ana' });

    expect(res.status).toBe(200);
    expect(res.body.summary).toContain('📍 Local: Palmas — TO');
  });

  test('retorna 400 quando nenhum agrônomo é escolhido e auto-pick está desativado', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        produtorNome: 'Produtor sem Destino',
        // whatsappAgronomo ausente, autoPickBySpecialty: false
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/agrônomo/i);
  });

  // ── Erro no serviço de WhatsApp ──────────────────────────────────────────

  test('retorna 500 quando evolutionService lança exceção', async () => {
    mockChatHistoryFindOne.mockResolvedValueOnce(null);
    mockChatHistoryFindAll.mockResolvedValueOnce([fakeMensagemIA]);

    const mockConv = makeMockConversation();
    mockConversationFindOrCreate.mockResolvedValueOnce([mockConv, true]);
    mockEvolutionSendMessage.mockRejectedValueOnce(new Error('Evolution API offline'));

    const res = await request(app)
      .post('/api/hybrid-chat/escalate')
      .set('X-Clerk-User-Id', PROD_ID)
      .send({
        threadId: THREAD_ID,
        agronomoParceiroId: AGR_ID,
        produtorNome: 'João Produtor',
      });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/falha/i);
  });
});
