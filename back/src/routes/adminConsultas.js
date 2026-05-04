const express = require('express');
const ConsultaAgronomica = require('../models/ConsultaAgronomica');
const HybridConversation = require('../models/HybridConversation');
const { clerkAdminAuth, parseClerkAdminIds } = require('../middleware/clerkAdminAuth');

const router = express.Router();

/** GET /api/admin/access-check — sem 403; o front usa para mostrar menu e página admin. */
router.get('/access-check', (req, res) => {
  const allow = parseClerkAdminIds();
  const clerkId = String(req.headers['x-clerk-user-id'] || '').trim();
  const configured = allow.length > 0;
  const clerkAdmin = Boolean(clerkId && configured && allow.includes(clerkId));
  return res.json({ clerkAdmin, configured });
});

const STATUSES = new Set(['novo', 'aguardando', 'em_andamento', 'concluido']);

function maskWhatsapp(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 4) return '—';
  return `••••${d.slice(-4)}`;
}

/**
 * GET /api/admin/consultas?status=&limit=&offset=
 * Lista tickets (`consultas_agronomicas`) com canal híbrido associado (se existir).
 */
router.get('/consultas', clerkAdminAuth, async (req, res) => {
  const rawStatus = String(req.query.status || '').trim();
  const where = {};
  if (rawStatus && STATUSES.has(rawStatus)) {
    where.status = rawStatus;
  }

  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(String(req.query.offset || '0'), 10) || 0, 0);

  try {
    const { rows, count } = await ConsultaAgronomica.findAndCountAll({
      where,
      distinct: true,
      col: 'id',
      order: [['dataAtualizacao', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: HybridConversation,
          as: 'hybridConversations',
          required: false,
          attributes: ['id', 'whatsappAgronomo', 'atendimentoAtivo', 'iaThreadId', 'intervencaoHumana'],
        },
      ],
    });

    const items = rows.map((q) => {
      const hybrids = q.hybridConversations || [];
      const h = hybrids[0] || null;
      return {
        id: q.id,
        status: q.status,
        urgencia: q.urgencia,
        especialidade: q.especialidade,
        assunto: q.assunto,
        preview: q.preview ? String(q.preview).slice(0, 280) : '',
        threadId: q.threadId,
        produtorClerkId: q.produtorClerkId,
        produtorNome: q.produtorNome,
        agronomoNome: q.agronomoNome,
        agronomoClerkId: q.agronomoClerkId,
        atendimentoAvaliacaoEstrelas: q.atendimentoAvaliacaoEstrelas,
        atendimentoAvaliacaoComentario: q.atendimentoAvaliacaoComentario,
        atendimentoAvaliacaoEm: q.atendimentoAvaliacaoEm,
        dataSolicitacao: q.dataSolicitacao,
        dataAtualizacao: q.dataAtualizacao,
        hybridConversationId: h ? h.id : null,
        hybridAtendimentoAtivo: h ? h.atendimentoAtivo : null,
        hybridWhatsappMasked: h ? maskWhatsapp(h.whatsappAgronomo) : null,
        hybridIaThreadId: h ? h.iaThreadId : null,
      };
    });

    return res.json({
      total: count,
      limit,
      offset,
      items,
    });
  } catch (e) {
    console.error('adminConsultas:', e);
    return res.status(500).json({ message: 'Falha ao listar consultas.' });
  }
});

module.exports = router;
