const express = require('express');
const HybridConversation = require('../models/HybridConversation');
const HybridMessage = require('../models/HybridMessage');
const { saveBuffer } = require('../services/hybridMediaStorage');
const { getMediaBuffer } = require('../services/evolutionApi');

const router = express.Router();

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

// remoteJid format: "5511999999999@s.whatsapp.net" or "5511999999999@c.us"
function extractPhone(remoteJid) {
  return normalizeDigits(String(remoteJid || '').split('@')[0]);
}

function extractText(message, messageType) {
  if (!message) return '';
  if (messageType === 'conversation') return String(message.conversation || '');
  if (messageType === 'extendedTextMessage') return String(message.extendedTextMessage?.text || '');
  if (messageType === 'imageMessage') return String(message.imageMessage?.caption || '');
  if (messageType === 'videoMessage') return String(message.videoMessage?.caption || '');
  if (messageType === 'audioMessage') return '';
  if (messageType === 'documentMessage') return String(message.documentMessage?.caption || '');
  return '';
}

const MEDIA_TYPES = new Set([
  'imageMessage',
  'audioMessage',
  'videoMessage',
  'documentMessage',
  'stickerMessage',
]);

function mimeFromMessage(messageType, message) {
  if (messageType === 'imageMessage') return message.imageMessage?.mimetype || 'image/jpeg';
  if (messageType === 'audioMessage') return message.audioMessage?.mimetype || 'audio/ogg; codecs=opus';
  if (messageType === 'videoMessage') return message.videoMessage?.mimetype || 'video/mp4';
  if (messageType === 'documentMessage') return message.documentMessage?.mimetype || 'application/octet-stream';
  return 'application/octet-stream';
}

function tipoFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'imagem';
  return 'imagem';
}

/** GET — verificação manual no navegador. */
router.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'climaagro-whatsapp-webhook',
    provider: 'evolution-api',
    hint: 'Configure no painel Evolution API: Webhook Global → POST para esta URL.',
  });
});

router.post('/', express.json({ limit: '8mb' }), async (req, res) => {
  // Segurança: validar apikey enviada pela Evolution API
  const expectedKey = process.env.EVOLUTION_API_KEY || '';
  const receivedKey = String(req.body?.apikey || req.headers['apikey'] || '');
  if (expectedKey && receivedKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Só processar o evento de nova mensagem
  if (req.body?.event !== 'messages.upsert') {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const data = req.body?.data;
  if (!data?.key) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  // Ignorar mensagens enviadas pelo próprio número (evita loop)
  if (data.key.fromMe === true) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const remoteJid = String(data.key.remoteJid || '');

  // Ignorar mensagens de grupos
  if (remoteJid.endsWith('@g.us')) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const messageId = String(data.key.id || '');
  const agronomoDigits = extractPhone(remoteJid);
  if (!agronomoDigits || agronomoDigits.length < 8) {
    return res.status(400).json({ error: 'Número de telefone inválido.' });
  }

  // Idempotência: ignorar mensagem já processada
  if (messageId) {
    const existing = await HybridMessage.findOne({ where: { externalMessageId: messageId } });
    if (existing) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
  }

  const message = data.message || {};
  const messageType = String(data.messageType || '');
  const text = extractText(message, messageType);
  const isMedia = MEDIA_TYPES.has(messageType);

  if (!isMedia && !text.trim()) {
    return res.status(200).json({ ok: true });
  }

  try {
    const candidates = await HybridConversation.findAll({
      where: { atendimentoAtivo: true, intervencaoHumana: true },
      order: [['updatedAt', 'DESC']],
      limit: 40,
    });
    const conv = candidates.find((c) => phonesMatch(c.whatsappAgronomo, agronomoDigits));

    if (!conv) {
      console.warn('[whatsapp webhook] Nenhuma conversa ativa para o agrônomo', agronomoDigits);
      return res.status(200).json({ ok: true });
    }

    const io = req.app.get('io');

    if (!isMedia) {
      const msg = await HybridMessage.create({
        conversationId: conv.id,
        remetenteId: agronomoDigits,
        conteudo: text.slice(0, 8000),
        tipo: 'texto',
        origem: 'whatsapp',
        externalMessageId: messageId || null,
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
        });
      }
      return res.status(200).json({ ok: true });
    }

    // Mensagem de mídia
    const mimeType = mimeFromMessage(messageType, message);
    const caption =
      text.trim().slice(0, 8000) ||
      (tipoFromMime(mimeType) === 'audio' ? '🎤 Áudio recebido' : '📷 Imagem recebida');

    let storageKey = null;
    let resolvedMime = mimeType;
    try {
      const result = await getMediaBuffer(data.key, message);
      resolvedMime = result.mimeType || mimeType;
      storageKey = await saveBuffer(result.buffer, resolvedMime);
    } catch (e) {
      console.error('[whatsapp webhook] download de mídia falhou:', e.message);
    }

    const msg = await HybridMessage.create({
      conversationId: conv.id,
      remetenteId: agronomoDigits,
      conteudo: caption,
      tipo: tipoFromMime(resolvedMime),
      origem: 'whatsapp',
      midiaStorageKey: storageKey,
      midiaMimeType: resolvedMime,
      externalMessageId: messageId || null,
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
          hasMidia: Boolean(storageKey),
          midiaMimeType: resolvedMime,
        },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[whatsapp webhook]', e);
    return res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

module.exports = router;
