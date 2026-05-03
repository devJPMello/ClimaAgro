const express = require('express');
const { Op } = require('sequelize');
const twilioService = require('../services/twilioService');
const ChatHistory = require('../models/ChatHistory');
const HybridConversation = require('../models/HybridConversation');
const HybridMessage = require('../models/HybridMessage');
const DualUserProfile = require('../models/DualUserProfile');
const { readStoredFile } = require('../services/hybridMediaStorage');

const router = express.Router();

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function headerProdutorId(req) {
  return String(req.headers['x-clerk-user-id'] || req.query.produtorClerkId || '').trim();
}

/** Bloqueia acesso se o thread já estiver associado a outro Clerk ID. */
async function produtorCanAccessIaThread(threadId, produtorClerkId) {
  if (!produtorClerkId) return false;
  const hostile = await ChatHistory.findOne({
    where: {
      threadId,
      isActive: true,
      [Op.and]: [
        { clerkUserId: { [Op.ne]: null } },
        { clerkUserId: { [Op.ne]: produtorClerkId } },
      ],
    },
  });
  return !hostile;
}

/** Últimas 10 mensagens no sentido alternado Produtor↔IAgro (5 pares de registros em chat_history). */
async function collectLastIaMessages(threadId, limitPairs = 5, produtorClerkId = null) {
  if (!produtorClerkId || !(await produtorCanAccessIaThread(threadId, produtorClerkId))) {
    return [];
  }
  const rows = await ChatHistory.findAll({
    where: {
      threadId,
      isActive: true,
      status: { [Op.ne]: 'error' },
      [Op.or]: [
        { clerkUserId: produtorClerkId },
        { clerkUserId: { [Op.is]: null } },
      ],
    },
    order: [['createdAt', 'DESC']],
    limit: limitPairs,
  });
  const chronological = [...rows].reverse();
  const out = [];
  for (const row of chronological) {
    out.push({ role: 'produtor', text: row.message });
    out.push({ role: 'iagro', text: row.response || '' });
  }
  return out.slice(-10);
}

function expandSpecialtySynonyms(term) {
  const out = [];
  const lower = String(term || '').toLowerCase();
  if (lower.includes('praga') || lower.includes('lagarta') || lower.includes('percevejo')) {
    out.push('Pragas', 'Fitossanidade', 'Fitossanidade e Pragas');
  }
  if (lower.includes('solo')) out.push('Solos', 'Solos e Nutrição de Plantas');
  if (lower.includes('irrig')) out.push('Irrigação');
  return out;
}

async function findAgronomoBySpecialty(hint) {
  const raw = String(hint || '').trim();
  if (!raw) return null;
  const synonyms = [raw, ...expandSpecialtySynonyms(raw)];
  const tried = new Set();
  for (const term of synonyms) {
    const t = String(term).trim();
    if (!t || tried.has(t.toLowerCase())) continue;
    tried.add(t.toLowerCase());
    const row = await DualUserProfile.findOne({
      where: {
        tipo: 'agronomo',
        parceiro: true,
        parceiroAtivo: true,
        whatsapp: { [Op.ne]: null },
        especialidade: { [Op.iLike]: `%${t}%` },
      },
      order: [['updatedAt', 'DESC']],
    });
    if (row && normalizeDigits(row.whatsapp).length >= 10) return row;
  }
  return null;
}

function buildRichWhatsappBody({ produtorNome, casoDestaque, iaLines }) {
  const nome = (produtorNome || 'Produtor(a)').trim() || 'Produtor(a)';
  const lastUser = [...iaLines].filter((l) => l.role === 'produtor').pop();
  const lastIa = [...iaLines].filter((l) => l.role === 'iagro').pop();
  const caso =
    (casoDestaque && String(casoDestaque).trim()) ||
    (lastIa && lastIa.text ? String(lastIa.text).slice(0, 250).trim() : '') ||
    (lastUser && lastUser.text ? String(lastUser.text).slice(0, 250).trim() : '');

  const anexosMencao =
    (lastUser && /\[Anexos:|foto|imagem|jpeg|png/i.test(lastUser.text || '')) ||
    (lastIa && /imagem|foto|anexo/i.test(lastIa.text || ''))
      ? '\n\nℹ️ Há menção a fotos/anexos no app — peça reenvio pelo WhatsApp se precisar de nova imagem.'
      : '';

  return [
    `Olá! O produtor *${nome}* precisa de apoio técnico via ClimaAgro / IAgro.`,
    '',
    `📋 Contexto do caso: ${caso || 'Conversa em andamento — veja o histórico abaixo.'}${anexosMencao}`,
    '',
    '--- Histórico recente (IAgro) ---',
    '',
    iaLines
      .map((item) => {
        const label = item.role === 'produtor' ? 'Produtor' : 'IAgro';
        return `${label}: ${String(item.text || '').trim().slice(0, 180)}`;
      })
      .join('\n\n'),
    '',
    '---',
    'Responda por aqui quando possível; o produtor acompanha no painel em tempo real.',
  ].join('\n');
}


/**
 * POST /api/hybrid-chat/escalate
 * Coleta histórico IA, cria/atualiza conversa, gera link wa.me e define intervenção humana.
 */
router.post('/escalate', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  const threadId = String(req.body?.threadId || '').trim();
  let whatsappRaw = String(req.body?.whatsappAgronomo || '').trim();
  let agronomoParceiroId = req.body?.agronomoParceiroId ? String(req.body.agronomoParceiroId).trim() : null;
  const produtorNome = String(req.body?.produtorNome || '').trim();
  const casoDestaque = String(req.body?.casoDestaque || '').trim();
  const specialtyFilter = String(req.body?.specialtyFilter || req.body?.especialidade || '').trim();
  const autoPick =
    req.body?.autoPickBySpecialty === true ||
    req.body?.autoPickBySpecialty === 'true' ||
    req.body?.autoPick === true;

  if (!produtorClerkId) {
    return res.status(400).json({ message: 'Informe o produtor (header X-Clerk-User-Id).' });
  }
  if (!threadId) {
    return res.status(400).json({ message: 'threadId é obrigatório.' });
  }

  try {
    const iaLines = await collectLastIaMessages(threadId, 5, produtorClerkId);
    if (iaLines.length === 0) {
      return res.status(400).json({ message: 'Não há mensagens da IA neste tópico para enviar.' });
    }

    let picked = null;
    if (autoPick || (!whatsappRaw && specialtyFilter)) {
      const hint = specialtyFilter || 'Pragas';
      picked = await findAgronomoBySpecialty(hint);
      if (!picked) {
        return res.status(404).json({
          message: `Nenhum agrônomo parceiro ativo encontrado para a especialidade "${hint}".`,
        });
      }
      whatsappRaw = picked.whatsapp;
      agronomoParceiroId = agronomoParceiroId || picked.id;
    }

    const whatsappAgronomo = normalizeDigits(whatsappRaw);
    if (!whatsappAgronomo || whatsappAgronomo.length < 10) {
      return res.status(400).json({ message: 'WhatsApp do agrônomo inválido ou não informado.' });
    }

    const casoFinal =
      casoDestaque ||
      (req.body?.conciergeReason ? String(req.body.conciergeReason).slice(0, 600) : '');

    const summary = buildRichWhatsappBody({
      produtorNome,
      casoDestaque: casoFinal,
      iaLines,
    });

    const [conversation] = await HybridConversation.findOrCreate({
      where: {
        produtorClerkId,
        iaThreadId: threadId,
      },
      defaults: {
        whatsappAgronomo,
        agronomoParceiroId,
        atendimentoAtivo: true,
        intervencaoHumana: true,
        produtorNomeSnapshot: produtorNome || null,
        casoResumoSnapshot: casoFinal || null,
      },
    });

    await conversation.update({
      whatsappAgronomo,
      agronomoParceiroId: agronomoParceiroId || conversation.agronomoParceiroId,
      atendimentoAtivo: true,
      intervencaoHumana: true,
      produtorNomeSnapshot: produtorNome || conversation.produtorNomeSnapshot,
      casoResumoSnapshot: casoFinal || conversation.casoResumoSnapshot,
    });

    const waUrl = `https://wa.me/${whatsappAgronomo}?text=${encodeURIComponent(summary)}`;

    const whatsapp = await twilioService.sendMessage(whatsappAgronomo, summary);

    return res.json({
      success: true,
      conversationId: conversation.id,
      waUrl,
      summary,
      intervencaoHumana: true,
      atendimentoAtivo: true,
      agronomoParceiroId: agronomoParceiroId || conversation.agronomoParceiroId,
      agronomoNome: picked ? picked.nome : undefined,
      agronomoEspecialidade: picked ? picked.especialidade : undefined,
      whatsapp,
    });
  } catch (e) {
    console.error('hybridChat escalate:', e);
    return res.status(500).json({ message: 'Falha ao preparar envio para o especialista.' });
  }
});

/** GET /api/hybrid-chat/status */
router.get('/status', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  const threadId = String(req.query.threadId || '').trim();
  if (!produtorClerkId || !threadId) {
    return res.status(400).json({ message: 'threadId e identificação do produtor são obrigatórios.' });
  }
  try {
    const conv = await HybridConversation.findOne({
      where: { produtorClerkId, iaThreadId: threadId },
    });
    if (!conv) {
      return res.json({
        conversation: null,
        intervencaoHumana: false,
        atendimentoAtivo: false,
      });
    }
    return res.json({
      conversation: {
        id: conv.id,
        whatsappAgronomo: conv.whatsappAgronomo,
        intervencaoHumana: conv.intervencaoHumana,
        atendimentoAtivo: conv.atendimentoAtivo,
        produtorNomeSnapshot: conv.produtorNomeSnapshot,
        casoResumoSnapshot: conv.casoResumoSnapshot,
      },
      intervencaoHumana: conv.intervencaoHumana,
      atendimentoAtivo: conv.atendimentoAtivo,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Falha ao consultar status.' });
  }
});

/** GET /api/hybrid-chat/timeline — mescla chat_history + mensagens híbridas */
router.get('/timeline', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  const threadId = String(req.query.threadId || '').trim();
  if (!produtorClerkId || !threadId) {
    return res.status(400).json({ message: 'threadId e produtor são obrigatórios.' });
  }

  try {
    const conv = await HybridConversation.findOne({
      where: { produtorClerkId, iaThreadId: threadId },
    });

    const rows =
      (await produtorCanAccessIaThread(threadId, produtorClerkId))
        ? await ChatHistory.findAll({
            where: {
              threadId,
              isActive: true,
              [Op.or]: [
                { clerkUserId: produtorClerkId },
                { clerkUserId: { [Op.is]: null } },
              ],
            },
            order: [['createdAt', 'ASC']],
          })
        : [];

    const iaTimeline = [];
    for (const row of rows) {
      iaTimeline.push({
        id: `${row.id}-u`,
        sender: 'user',
        kind: 'ia',
        text: row.message,
        createdAt: row.createdAt,
      });
      iaTimeline.push({
        id: `${row.id}-a`,
        sender: 'assistant',
        kind: 'ia',
        text: row.response || '',
        createdAt: row.updatedAt || row.createdAt,
      });
    }

    let hybridTimeline = [];
    if (conv) {
      const msgs = await HybridMessage.findAll({
        where: { conversationId: conv.id },
        order: [['createdAt', 'ASC']],
      });
      hybridTimeline = msgs.map((m) => {
        const sender = m.origem === 'whatsapp' ? 'agronomo' : 'user';
        return {
          id: m.id,
          sender,
          kind: 'hybrid',
          text: m.conteudo,
          tipo: m.tipo,
          origem: m.origem,
          createdAt: m.createdAt,
          hasMidia: Boolean(m.midiaStorageKey),
          midiaMimeType: m.midiaMimeType || null,
        };
      });
    }

    const merged = [...iaTimeline, ...hybridTimeline].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return res.json({
      threadId,
      conversation: conv
        ? {
            id: conv.id,
            intervencaoHumana: conv.intervencaoHumana,
            atendimentoAtivo: conv.atendimentoAtivo,
            whatsappAgronomo: conv.whatsappAgronomo,
            produtorNomeSnapshot: conv.produtorNomeSnapshot,
            casoResumoSnapshot: conv.casoResumoSnapshot,
          }
        : null,
      messages: merged,
    });
  } catch (e) {
    console.error('hybridChat timeline:', e);
    return res.status(500).json({ message: 'Falha ao montar linha do tempo.' });
  }
});

/**
 * POST /api/hybrid-chat/conversations/:id/messages
 * Produtor envia texto pelo sistema → Twilio WhatsApp (se configurado) + persistência + Socket.IO
 */
router.post('/conversations/:id/messages', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  const conversationId = String(req.params.id || '').trim();
  const conteudo = String(req.body?.conteudo || '').trim();
  if (!produtorClerkId) {
    return res.status(400).json({ message: 'Header X-Clerk-User-Id obrigatório.' });
  }
  if (!conteudo) {
    return res.status(400).json({ message: 'conteudo é obrigatório.' });
  }

  try {
    const conv = await HybridConversation.findByPk(conversationId);
    if (!conv || conv.produtorClerkId !== produtorClerkId) {
      return res.status(404).json({ message: 'Conversa não encontrada.' });
    }
    if (!conv.intervencaoHumana || !conv.atendimentoAtivo) {
      return res.status(400).json({ message: 'Atendimento humano não está ativo nesta conversa.' });
    }

    const msg = await HybridMessage.create({
      conversationId: conv.id,
      remetenteId: produtorClerkId,
      conteudo,
      tipo: 'texto',
      origem: 'sistema',
    });

    const whatsapp = await twilioService.sendMessage(conv.whatsappAgronomo, `[ClimaAgro | Produtor]\n${conteudo}`);

    const io = req.app.get('io');
    if (io) {
      io.to(`produtor:${produtorClerkId}`).emit('hybrid:message', {
        conversationId: conv.id,
        threadId: conv.iaThreadId,
        message: {
          id: msg.id,
          sender: 'user',
          kind: 'hybrid',
          text: msg.conteudo,
          tipo: msg.tipo,
          origem: msg.origem,
          createdAt: msg.createdAt,
          hasMidia: Boolean(msg.midiaStorageKey),
          midiaMimeType: msg.midiaMimeType || null,
        },
        whatsapp,
      });
    }

    return res.json({
      success: true,
      message: {
        id: msg.id,
        conteudo: msg.conteudo,
        createdAt: msg.createdAt,
      },
      whatsapp,
    });
  } catch (e) {
    console.error('hybridChat send:', e);
    return res.status(500).json({ message: 'Falha ao enviar mensagem.' });
  }
});

/**
 * PATCH /api/hybrid-chat/conversations/:id
 * Encerra ou reabre atendimento humano (roteamento WhatsApp ↔ painel).
 */
router.patch('/conversations/:id', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  const conversationId = String(req.params.id || '').trim();
  if (!produtorClerkId) {
    return res.status(400).json({ message: 'Header X-Clerk-User-Id obrigatório.' });
  }
  const ativo = req.body?.atendimentoAtivo;
  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ message: 'Informe atendimentoAtivo (boolean).' });
  }
  try {
    const conv = await HybridConversation.findByPk(conversationId);
    if (!conv || conv.produtorClerkId !== produtorClerkId) {
      return res.status(404).json({ message: 'Conversa não encontrada.' });
    }

    const patch = { atendimentoAtivo: ativo };

    let novaNotaParaParceiro = null;
    const jaTinhaAvaliacoNaConversa =
      conv.avaliacaoEstrelas != null &&
      Number(conv.avaliacaoEstrelas) >= 1 &&
      conv.avaliacaoEm != null;

    if (ativo === false) {
      const rawStars = req.body?.avaliacaoEstrelas;
      const hasStars =
        rawStars !== undefined &&
        rawStars !== null &&
        rawStars !== '' &&
        Number.isFinite(Number(rawStars));
      if (hasStars) {
        const n = Number.parseInt(String(rawStars), 10);
        if (Number.isNaN(n) || n < 1 || n > 5) {
          return res.status(400).json({ message: 'avaliacaoEstrelas deve ser um inteiro entre 1 e 5.' });
        }
        const comentario =
          req.body?.avaliacaoComentario != null
            ? String(req.body.avaliacaoComentario).trim().slice(0, 2000)
            : '';
        patch.avaliacaoEstrelas = n;
        patch.avaliacaoComentario = comentario || null;
        patch.avaliacaoEm = new Date();
        if (!jaTinhaAvaliacoNaConversa) {
          novaNotaParaParceiro = n;
        }
      }
    }

    await conv.update(patch);

    if (novaNotaParaParceiro != null && conv.agronomoParceiroId) {
      const agr = await DualUserProfile.findByPk(conv.agronomoParceiroId);
      if (agr && agr.tipo === 'agronomo' && agr.parceiro) {
        const soma = (agr.parceiroAvaliacaoSoma || 0) + novaNotaParaParceiro;
        const qtd = (agr.parceiroAvaliacaoQtd || 0) + 1;
        await agr.update({
          parceiroAvaliacaoSoma: soma,
          parceiroAvaliacaoQtd: qtd,
        });
      }
    }
    return res.json({
      success: true,
      conversationId: conv.id,
      atendimentoAtivo: conv.atendimentoAtivo,
      avaliacaoEstrelas: conv.avaliacaoEstrelas,
      avaliacaoComentario: conv.avaliacaoComentario,
      avaliacaoEm: conv.avaliacaoEm,
    });
  } catch (e) {
    console.error('hybridChat patch:', e);
    return res.status(500).json({ message: 'Falha ao atualizar atendimento.' });
  }
});

/**
 * GET /api/hybrid-chat/media/:messageId
 * Retorna arquivo binário (imagem/áudio) — apenas o produtor dono da conversa.
 */
router.get('/media/:messageId', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  if (!produtorClerkId) {
    return res.status(401).json({ message: 'Header X-Clerk-User-Id obrigatório.' });
  }
  try {
    const msg = await HybridMessage.findByPk(req.params.messageId);
    if (!msg || !msg.midiaStorageKey) {
      return res.status(404).json({ message: 'Mídia não encontrada.' });
    }
    const conv = await HybridConversation.findByPk(msg.conversationId);
    if (!conv || conv.produtorClerkId !== produtorClerkId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }
    const buf = await readStoredFile(msg.midiaStorageKey);
    res.setHeader('Content-Type', msg.midiaMimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(buf);
  } catch (e) {
    console.error('hybridChat media:', e);
    return res.status(500).json({ message: 'Falha ao ler mídia.' });
  }
});

/** Lista conversas híbridas do produtor (painel esquerdo) */
router.get('/conversations', async (req, res) => {
  const produtorClerkId = headerProdutorId(req);
  if (!produtorClerkId) {
    return res.status(400).json({ message: 'Informe o produtor.' });
  }
  try {
    const rows = await HybridConversation.findAll({
      where: { produtorClerkId },
      order: [['updatedAt', 'DESC']],
      limit: 50,
    });
    return res.json({
      conversations: rows.map((c) => ({
        id: c.id,
        iaThreadId: c.iaThreadId,
        whatsappAgronomo: c.whatsappAgronomo,
        intervencaoHumana: c.intervencaoHumana,
        atendimentoAtivo: c.atendimentoAtivo,
        updatedAt: c.updatedAt,
        produtorNomeSnapshot: c.produtorNomeSnapshot,
        casoResumoSnapshot: c.casoResumoSnapshot,
      })),
    });
  } catch (e) {
    return res.status(500).json({ message: 'Falha ao listar conversas.' });
  }
});

module.exports = router;
