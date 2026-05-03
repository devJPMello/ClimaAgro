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

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twimlOk(res) {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(TWIML_OK);
}

/** GET — verificação manual no navegador. */
router.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'climaagro-whatsapp-webhook',
    provider: 'twilio',
    hint: 'Configure no Console Twilio: Messaging → Try it out → Sandbox Settings → campo "WHEN A MESSAGE COMES IN".',
  });
});

// Twilio envia application/x-www-form-urlencoded — NÃO é JSON
router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  // TODO (pós-TCC / produção): validar X-Twilio-Signature com twilio.validateRequest()
  // para garantir que a requisição realmente vem do Twilio.

  const from = String(req.body?.From || '');
  const body = String(req.body?.Body || '').trim();
  const messageSid = String(req.body?.MessageSid || '');
  const numMedia = parseInt(req.body?.NumMedia || '0', 10);

  // "From" vem como "whatsapp:+5563999999999" — extrair só os dígitos
  const agronomoDigits = normalizeDigits(from.replace(/^whatsapp:/i, ''));
  console.log(`[Twilio webhook] Mensagem recebida | de=${agronomoDigits} sid=${messageSid} numMedia=${numMedia} body="${body.slice(0, 60)}"`);

  if (!agronomoDigits || agronomoDigits.length < 8) {
    console.warn('[Twilio webhook] Número inválido, ignorando.');
    return twimlOk(res);
  }

  // Idempotência: ignorar MessageSid já processado (Twilio pode reenviar em timeout)
  if (messageSid) {
    try {
      const existing = await HybridMessage.findOne({ where: { externalMessageId: messageSid } });
      if (existing) {
        console.log(`[Twilio webhook] SID ${messageSid} já processado — ignorando duplicata.`);
        return twimlOk(res);
      }
    } catch (e) {
      console.warn('[Twilio webhook] Não foi possível checar idempotência (coluna pode estar faltando):', e.message);
    }
  }

  // Montar texto: corpo da mensagem ou placeholder se só mídia
  const text =
    body ||
    (numMedia > 0 ? `📎 Mídia recebida (${numMedia} arquivo${numMedia > 1 ? 's' : ''})` : '');

  if (!text) {
    console.warn('[Twilio webhook] Mensagem sem body e sem mídia, ignorando.');
    return twimlOk(res);
  }

  try {
    const candidates = await HybridConversation.findAll({
      where: { atendimentoAtivo: true, intervencaoHumana: true },
      order: [['updatedAt', 'DESC']],
      limit: 40,
    });
    console.log(`[Twilio webhook] ${candidates.length} conversa(s) ativa(s) encontrada(s). Buscando match para ${agronomoDigits}...`);

    const conv = candidates.find((c) => phonesMatch(c.whatsappAgronomo, agronomoDigits));

    if (!conv) {
      const stored = candidates.map((c) => c.whatsappAgronomo).join(', ') || '(nenhuma)';
      console.warn(`[Twilio webhook] Nenhuma conversa ativa para o agrônomo ${agronomoDigits}. Números no banco: ${stored}`);
      return twimlOk(res);
    }

    console.log(`[Twilio webhook] Match encontrado: conversa ${conv.id} | produtor ${conv.produtorClerkId}`);

    // Tenta salvar com externalMessageId; se a coluna ainda não existir no banco,
    // faz fallback sem ela para garantir que a mensagem seja salva e o Socket.IO seja emitido.
    let msg;
    try {
      msg = await HybridMessage.create({
        conversationId: conv.id,
        remetenteId: agronomoDigits,
        conteudo: text.slice(0, 8000),
        tipo: 'texto',
        origem: 'whatsapp',
        externalMessageId: messageSid || null,
      });
    } catch (createErr) {
      console.warn('[Twilio webhook] create com externalMessageId falhou, tentando sem ela:', createErr.message);
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
      console.log(`[Twilio webhook] Socket.IO emitido para sala produtor:${conv.produtorClerkId}`);
    } else {
      console.warn('[Twilio webhook] io não disponível — Socket.IO não configurado no app.');
    }

    return twimlOk(res);
  } catch (e) {
    console.error('[Twilio webhook] Erro ao processar mensagem:', e.message, e.stack);
    // Sempre responder 200 pro Twilio — evita reenvios em loop
    return twimlOk(res);
  }
});

module.exports = router;
