const request = require('supertest');
const express = require('express');

jest.mock('../models/HybridConversation', () => ({ findAll: jest.fn().mockResolvedValue([]) }));
jest.mock('../models/HybridMessage', () => ({}));

// Evento que o webhook ignora logo depois da checagem da senha (não toca no banco).
const eventoIgnorado = { event: 'connection.update', data: {} };

describe('senha do webhook do WhatsApp', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/webhook/evolution', require('../routes/whatsappWebhook'));
  });

  afterEach(() => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  });

  test('sem senha configurada, aceita como antes (ambiente local)', async () => {
    const res = await request(app).post('/webhook/evolution').send(eventoIgnorado);
    expect(res.status).toBe(200);
  });

  test('com senha configurada, recusa quem não manda a senha', async () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = 'senha-certa-123';
    const res = await request(app).post('/webhook/evolution').send(eventoIgnorado);
    expect(res.status).toBe(401);
  });

  test('com senha configurada, recusa senha errada', async () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = 'senha-certa-123';
    const res = await request(app)
      .post('/webhook/evolution')
      .set('x-webhook-secret', 'senha-errada')
      .send(eventoIgnorado);
    expect(res.status).toBe(401);
  });

  test('com senha configurada, aceita a senha certa', async () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = 'senha-certa-123';
    const res = await request(app)
      .post('/webhook/evolution')
      .set('x-webhook-secret', 'senha-certa-123')
      .send(eventoIgnorado);
    expect(res.status).toBe(200);
  });
});
