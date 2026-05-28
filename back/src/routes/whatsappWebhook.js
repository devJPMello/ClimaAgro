const express = require('express');
const HybridConversation = require('../models/HybridConversation');
const HybridMessage = require('../models/HybridMessage');

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

/** Extrai texto de qualquer tipo de mensagem Evolution API. */
function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.audioMessage?.caption ||
    ''
  );
}

/** GET — verificação manual no navegador. */
router.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'climaagro-whatsapp-webhook',
    provider: 'evolution-api',
    hint: 'Configure no painel Evolution API: Instância → Webhooks → URL deste endpoint com evento "MESSAGES_UPSERT".',
  });
});

router.post('/', express.json(), async (req, res) => {
  const event = req.body?.event;

  // Ignorar eventos que não sejam de mensagens recebidas
  if (event !== 'messages.upsert') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const data = req.body?.data;
  const key = data?.key;

  // Ignorar mensagens enviadas por nós mesmos
  if (!key || key.fromMe === true) {
    return res.status(200).json({ received: true, skipped: true });
  }

  // remoteJid vem como "5563999999999@s.whatsapp.net"
  const remoteJid = String(key.remoteJid || '');
  const agronomoDigits = normalizeDigits(remoteJid.split('@')[0]);
  const messageId = String(key.id || '');

  console.log(`[Evolution webhook] Mensagem recebida | de=${agronomoDigits} id=${messageId}`);

  if (!agronomoDigits || agronomoDigits.length < 8) {
    console.warn('[Evolution webhook] Número inválido, ignorando.');
    return res.status(200).json({ received: true, skipped: true });
  }

  // Idempotência: ignorar messageId já processado
  if (messageId) {
    try {
      const existing = await HybridMessage.findOne({ where: { externalMessageId: messageId } });
      if (existing) {
        console.log(`[Evolution webhook] id ${messageId} já processado — ignorando duplicata.`);
        return res.status(200).json({ received: true, skipped: true });
      }
    } catch (e) {
      console.warn('[Evolution webhook] Não foi possível checar idempotência:', e.message);
    }
  }

  const rawText = extractText(data?.message);
  const hasMedia = data?.messageType && data.messageType !== 'conversation' && data.messageType !== 'extendedTextMessage';
  const text =
    rawText ||
    (hasMedia ? `📎 Mídia recebida` : '');

  if (!text) {
    console.warn('[Evolution webhook] Mensagem sem conteúdo reconhecível, ignorando.');
    return res.status(200).json({ received: true, skipped: true });
  }

  try {
    const candidates = await HybridConversation.findAll({
      where: { atendimentoAtivo: true, intervencaoHumana: true },
      order: [['updatedAt', 'DESC']],
      limit: 40,
    });
    console.log(`[Evolution webhook] ${candidates.length} conversa(s) ativa(s). Buscando match para ${agronomoDigits}...`);

    const conv = candidates.find((c) => phonesMatch(c.whatsappAgronomo, agronomoDigits));

    if (!conv) {
      const stored = candidates.map((c) => c.whatsappAgronomo).join(', ') || '(nenhuma)';
      console.warn(`[Evolution webhook] Nenhuma conversa ativa para o agrônomo ${agronomoDigits}. Números no banco: ${stored}`);
      return res.status(200).json({ received: true, skipped: true });
    }

    console.log(`[Evolution webhook] Match encontrado: conversa ${conv.id} | produtor ${conv.produtorClerkId}`);

    let msg;
    try {
      msg = await HybridMessage.create({
        conversationId: conv.id,
        remetenteId: agronomoDigits,
        conteudo: text.slice(0, 8000),
        tipo: 'texto',
        origem: 'whatsapp',
        externalMessageId: messageId || null,
      });
    } catch (createErr) {
      console.warn('[Evolution webhook] create com externalMessageId falhou, tentando sem ela:', createErr.message);
      msg = await HybridMessage.create({
        conversationId: conv.id,
        remetenteId: agronomoDigits,
        conteudo: text.slice(0, 8000),
        tipo: 'texto',
        origem: 'whatsapp',
      });
    }

    const io = req.app.get('io');
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
      console.log(`[Evolution webhook] Socket.IO emitido para sala produtor:${conv.produtorClerkId}`);
    } else {
      console.warn('[Evolution webhook] io não disponível — Socket.IO não configurado no app.');
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('[Evolution webhook] Erro ao processar mensagem:', e.message, e.stack);
    return res.status(200).json({ received: true });
  }
});

module.exports = router;
