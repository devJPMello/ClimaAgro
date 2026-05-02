const express = require('express');
const axios = require('axios');
const HybridConversation = require('../models/HybridConversation');
const HybridMessage = require('../models/HybridMessage');
const { saveBuffer, fetchRemoteToBuffer } = require('../services/hybridMediaStorage');

const router = express.Router();

function dualBodyParser(req, res, next) {
  const ct = String(req.get('content-type') || '');
  if (ct.includes('application/json')) {
    return express.json({ limit: '8mb' })(req, res, next);
  }
  return express.urlencoded({ extended: true, limit: '8mb' })(req, res, next);
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phonesMatch(stored, inbound) {
  const s = normalizeDigits(stored);
  const i = normalizeDigits(inbound);
  if (!s || !i) return false;
  if (s === i) return true;
  if (i.endsWith(s) || s.endsWith(i)) return true;
  if (s.slice(-9) === i.slice(-9)) return true;
  return false;
}

function tipoFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'imagem';
  return 'imagem';
}

/**
 * Extrai remetente, texto e mídias (Twilio / genérico).
 */
function parseInbound(body) {
  if (!body || typeof body !== 'object') return null;

  const twilioFrom = body.From || body.from;
  if (twilioFrom) {
    const digits = normalizeDigits(twilioFrom);
    const numMedia = Number(body.NumMedia || body.numMedia || 0);
    const media = [];
    for (let i = 0; i < numMedia; i++) {
      const url = body[`MediaUrl${i}`];
      const ct = body[`MediaContentType${i}`] || 'application/octet-stream';
      if (url) media.push({ url, contentType: ct });
    }
    const text = String(body.Body ?? body.body ?? '');
    return { fromDigits: digits, text, media, provider: 'twilio' };
  }

  const phone =
    body.phone ||
    body.de ||
    body.sender ||
    body.from ||
    (body.data && (body.data.phone || body.data.sender)) ||
    '';
  const text =
    body.message ||
    body.texto ||
    body.text ||
    body.body ||
    (body.data && (body.data.message || body.data.text)) ||
    '';

  const media = [];
  const singleUrl = body.mediaUrl || body.media_url || body.url || (body.data && body.data.mediaUrl);
  const singleMime =
    body.mimeType || body.mime || body.contentType || 'image/jpeg';

  if (singleUrl) {
    media.push({ url: singleUrl, contentType: singleMime });
  }

  if (phone && (text || media.length > 0)) {
    return {
      fromDigits: normalizeDigits(phone),
      text: String(text || ''),
      media,
      provider: 'generic',
    };
  }

  return null;
}

async function persistInboundMessages(conv, parsed, req) {
  const io = req.app.get('io');
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  const agronomoDigits = parsed.fromDigits;

  if (parsed.media.length === 0) {
    const msg = await HybridMessage.create({
      conversationId: conv.id,
      remetenteId: agronomoDigits,
      conteudo: parsed.text.slice(0, 8000),
      tipo: 'texto',
      origem: 'whatsapp',
    });
    if (io) {
      io.to(`produtor:${conv.produtorClerkId}`).emit('hybrid:message', {
        conversationId: conv.id,
        threadId: conv.iaThreadId,
        message: {
          id: msg.id,
          sender: 'agronomo',
          kind: 'hybrid',
          text: msg.conteudo,
          tipo: msg.tipo,
          origem: msg.origem,
          createdAt: msg.createdAt,
          hasMidia: false,
          midiaMimeType: null,
        },
        provider: parsed.provider,
      });
    }
    return;
  }

  for (let i = 0; i < parsed.media.length; i++) {
    const m = parsed.media[i];
    let buffer;
    try {
      if (parsed.provider === 'twilio' && sid && token) {
        buffer = await fetchRemoteToBuffer(m.url, { auth: { username: sid, password: token } });
      } else {
        buffer = await fetchRemoteToBuffer(m.url);
      }
    } catch (e) {
      console.error('[whatsapp webhook] download media failed', e.message);
      continue;
    }

    const storageKey = await saveBuffer(buffer, m.contentType);
    const tipo = tipoFromMime(m.contentType);
    const caption =
      i === 0 && parsed.text.trim()
        ? parsed.text.trim().slice(0, 8000)
        : tipo === 'audio'
          ? '🎤 Áudio recebido'
          : '📷 Imagem recebida';

    const msg = await HybridMessage.create({
      conversationId: conv.id,
      remetenteId: agronomoDigits,
      conteudo: caption,
      tipo,
      origem: 'whatsapp',
      midiaStorageKey: storageKey,
      midiaMimeType: m.contentType || null,
    });

    if (io) {
      io.to(`produtor:${conv.produtorClerkId}`).emit('hybrid:message', {
        conversationId: conv.id,
        threadId: conv.iaThreadId,
        message: {
          id: msg.id,
          sender: 'agronomo',
          kind: 'hybrid',
          text: msg.conteudo,
          tipo: msg.tipo,
          origem: msg.origem,
          createdAt: msg.createdAt,
          hasMidia: true,
          midiaMimeType: msg.midiaMimeType,
        },
        provider: parsed.provider,
      });
    }
  }
}

router.post('/', dualBodyParser, async (req, res) => {
  const parsed = parseInbound(req.body);
  if (!parsed || !parsed.fromDigits) {
    return res.status(400).json({ success: false, message: 'Payload não reconhecido.' });
  }

  const agronomoDigits = parsed.fromDigits;

  try {
    const candidates = await HybridConversation.findAll({
      where: {
        atendimentoAtivo: true,
        intervencaoHumana: true,
      },
      order: [['updatedAt', 'DESC']],
      limit: 40,
    });
    const conv = candidates.find((c) => phonesMatch(c.whatsappAgronomo, agronomoDigits));

    if (!conv) {
      console.warn('[whatsapp webhook] Nenhuma conversa ativa para o agrônomo', agronomoDigits);
      return res.status(200).type('text/plain').send('OK');
    }

    if (parsed.media.length === 0 && !parsed.text.trim()) {
      return res.status(200).type('text/plain').send('OK');
    }

    await persistInboundMessages(conv, parsed, req);

    return res.status(200).type('text/plain').send('OK');
  } catch (e) {
    console.error('[whatsapp webhook]', e);
    return res.status(500).json({ success: false, message: 'Erro ao processar webhook.' });
  }
});

module.exports = router;
