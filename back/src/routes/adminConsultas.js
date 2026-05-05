const express = require('express');
const { Op } = require('sequelize');
const ConsultaAgronomica = require('../models/ConsultaAgronomica');
const HybridConversation = require('../models/HybridConversation');
const { clerkAdminAuth, parseClerkAdminIds } = require('../middleware/clerkAdminAuth');

const router = express.Router();
const sequelize = ConsultaAgronomica.sequelize;

const STATUSES = new Set(['novo', 'aguardando', 'em_andamento', 'concluido']);
const URGENCIAS = new Set(['baixa', 'media', 'alta']);
const SORT_KEYS = new Set([
  'atualizacao_desc',
  'atualizacao_asc',
  'solicitacao_desc',
  'solicitacao_asc',
  'urgencia_desc',
  'urgencia_asc',
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Canal híbrido “principal”: ativo primeiro; em empate, `updatedAt` mais recente. */
function pickPrimaryHybrid(hybrids) {
  if (!hybrids?.length) return null;
  const sorted = [...hybrids].sort((a, b) => {
    if (Boolean(a.atendimentoAtivo) !== Boolean(b.atendimentoAtivo)) {
      return a.atendimentoAtivo ? -1 : 1;
    }
    const ta = new Date(a.updatedAt || 0).getTime();
    const tb = new Date(b.updatedAt || 0).getTime();
    return tb - ta;
  });
  return sorted[0];
}

function maskWhatsapp(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 4) return '—';
  return `••••${d.slice(-4)}`;
}

/** Express pode expor o mesmo parâmetro como array (query duplicada). */
function firstQuery(val) {
  if (val == null) return '';
  const raw = Array.isArray(val) ? val[0] : val;
  return String(raw ?? '').trim();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Monta o WHERE com `Op.and` explícito — misturar `[Op.or]` (pesquisa) e intervalo de datas
 * no mesmo objeto quebra o SQL em alguns caminhos do Sequelize (intervalo é ignorado).
 */
function parseQueryFilters(req) {
  const parts = [];

  const rawStatus = firstQuery(req.query.status);
  if (rawStatus && STATUSES.has(rawStatus)) {
    parts.push({ status: rawStatus });
  }

  const rawUrgencia = firstQuery(req.query.urgencia);
  if (rawUrgencia && URGENCIAS.has(rawUrgencia)) {
    parts.push({ urgencia: rawUrgencia });
  }

  const q = firstQuery(req.query.q).slice(0, 200);
  if (q) {
    const like = `%${q}%`;
    parts.push({
      [Op.or]: [
        { assunto: { [Op.iLike]: like } },
        { produtorNome: { [Op.iLike]: like } },
        { produtorClerkId: { [Op.iLike]: like } },
        { agronomoNome: { [Op.iLike]: like } },
        { agronomoClerkId: { [Op.iLike]: like } },
        { especialidade: { [Op.iLike]: like } },
        { threadId: { [Op.iLike]: like } },
      ],
    });
  }

  const dateField = firstQuery(req.query.dateField) || 'atualizacao';
  const col = dateField === 'solicitacao' ? 'dataSolicitacao' : 'dataAtualizacao';
  const dateFrom = firstQuery(req.query.dateFrom);
  const dateTo = firstQuery(req.query.dateTo);

  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom && ISO_DATE_RE.test(dateFrom)) {
      range[Op.gte] = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo && ISO_DATE_RE.test(dateTo)) {
      range[Op.lte] = new Date(`${dateTo}T23:59:59.999Z`);
    }
    if (Object.keys(range).length) {
      parts.push({ [col]: range });
    }
  }

  const sortRaw = firstQuery(req.query.sort) || 'atualizacao_desc';
  const sort = SORT_KEYS.has(sortRaw) ? sortRaw : 'atualizacao_desc';

  let where = {};
  if (parts.length === 1) {
    where = parts[0];
  } else if (parts.length > 1) {
    where = { [Op.and]: parts };
  }

  return { where, sort };
}

function buildOrder(sortKey) {
  const urgCase =
    '(CASE "consultas_agronomicas"."urgencia" WHEN \'alta\' THEN 1 WHEN \'media\' THEN 2 WHEN \'baixa\' THEN 3 END)';
  switch (sortKey) {
    case 'atualizacao_asc':
      return [['dataAtualizacao', 'ASC']];
    case 'atualizacao_desc':
      return [['dataAtualizacao', 'DESC']];
    case 'solicitacao_desc':
      return [['dataSolicitacao', 'DESC']];
    case 'solicitacao_asc':
      return [['dataSolicitacao', 'ASC']];
    case 'urgencia_desc':
      return [[sequelize.literal(urgCase), 'ASC'], ['dataAtualizacao', 'DESC']];
    case 'urgencia_asc':
      return [[sequelize.literal(urgCase), 'DESC'], ['dataAtualizacao', 'DESC']];
    default:
      return [['dataAtualizacao', 'DESC']];
  }
}

const HYBRID_LIST_ATTRS = [
  'id',
  'whatsappAgronomo',
  'atendimentoAtivo',
  'iaThreadId',
  'intervencaoHumana',
  'updatedAt',
];

const hybridIncludeList = {
  model: HybridConversation,
  as: 'hybridConversations',
  required: false,
  attributes: HYBRID_LIST_ATTRS,
};

function mapListItem(q, h) {
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
    dataSolicitacao: q.dataSolicitacao,
    dataAtualizacao: q.dataAtualizacao,
    hybridConversationId: h ? h.id : null,
    hybridAtendimentoAtivo: h ? h.atendimentoAtivo : null,
    hybridWhatsappMasked: h ? maskWhatsapp(h.whatsappAgronomo) : null,
    hybridIaThreadId: h ? h.iaThreadId : null,
  };
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** GET /api/admin/access-check — sem 403; o front usa para mostrar menu e página admin. */
router.get('/access-check', (req, res) => {
  const allow = parseClerkAdminIds();
  const clerkId = String(req.headers['x-clerk-user-id'] || '').trim();
  const configured = allow.length > 0;
  const clerkAdmin = Boolean(clerkId && configured && allow.includes(clerkId));
  return res.json({ clerkAdmin, configured });
});

/**
 * GET /api/admin/consultas/export — CSV (mesmos filtros da lista; máx. 5000 linhas).
 * Registar antes de /consultas/:id para não confundir com UUID.
 */
router.get('/consultas/export', clerkAdminAuth, async (req, res) => {
  const { where, sort } = parseQueryFilters(req);
  const order = buildOrder(sort);
  const EXPORT_MAX = 5000;

  try {
    const rows = await ConsultaAgronomica.findAll({
      where,
      order,
      limit: EXPORT_MAX,
      include: [hybridIncludeList],
    });

    const header = [
      'id',
      'status',
      'urgencia',
      'assunto',
      'produtor_nome',
      'produtor_clerk_id',
      'agronomo_nome',
      'avaliacao_estrelas',
      'data_solicitacao',
      'data_atualizacao',
      'hybrid_conversation_id',
      'hybrid_ia_thread_id',
      'hybrid_whatsapp_mascarado',
    ].join(';');

    const lines = rows.map((q) => {
      const h = pickPrimaryHybrid(q.hybridConversations || []);
      return [
        csvEscape(q.id),
        csvEscape(q.status),
        csvEscape(q.urgencia),
        csvEscape(q.assunto),
        csvEscape(q.produtorNome),
        csvEscape(q.produtorClerkId),
        csvEscape(q.agronomoNome),
        csvEscape(q.atendimentoAvaliacaoEstrelas ?? ''),
        csvEscape(q.dataSolicitacao),
        csvEscape(q.dataAtualizacao),
        csvEscape(h ? h.id : ''),
        csvEscape(h ? h.iaThreadId : ''),
        csvEscape(h ? maskWhatsapp(h.whatsappAgronomo) : ''),
      ].join(';');
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="climaagro-consultas.csv"');
    return res.send(`\uFEFF${header}\r\n${lines.join('\r\n')}`);
  } catch (e) {
    console.error('adminConsultas export:', e);
    return res.status(500).json({ message: 'Falha ao exportar consultas.' });
  }
});

/**
 * GET /api/admin/consultas/:id
 * Detalhe completo (incl. comentário de avaliação) + todas as conversas híbridas ligadas.
 */
router.get('/consultas/:id', clerkAdminAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const row = await ConsultaAgronomica.findByPk(id, {
      include: [
        {
          model: HybridConversation,
          as: 'hybridConversations',
          required: false,
          separate: true,
          order: [
            ['atendimentoAtivo', 'DESC'],
            ['updatedAt', 'DESC'],
          ],
          attributes: [
            'id',
            'iaThreadId',
            'whatsappAgronomo',
            'atendimentoAtivo',
            'intervencaoHumana',
            'updatedAt',
            'createdAt',
          ],
        },
      ],
    });

    if (!row) {
      return res.status(404).json({ message: 'Consulta não encontrada.' });
    }

    const hybrids = row.hybridConversations || [];
    const primary = pickPrimaryHybrid(hybrids);

    const hybridSummaries = hybrids.map((h) => ({
      id: h.id,
      iaThreadId: h.iaThreadId,
      atendimentoAtivo: h.atendimentoAtivo,
      intervencaoHumana: h.intervencaoHumana,
      updatedAt: h.updatedAt,
      createdAt: h.createdAt,
      whatsappMasked: maskWhatsapp(h.whatsappAgronomo),
    }));

    return res.json({
      consulta: {
        id: row.id,
        status: row.status,
        urgencia: row.urgencia,
        especialidade: row.especialidade,
        assunto: row.assunto,
        preview: row.preview,
        conversa: row.conversa,
        threadId: row.threadId,
        produtorClerkId: row.produtorClerkId,
        produtorNome: row.produtorNome,
        produtorEmail: row.produtorEmail,
        produtorTelefone: row.produtorTelefone,
        produtorMunicipio: row.produtorMunicipio,
        produtorUf: row.produtorUf,
        agronomoClerkId: row.agronomoClerkId,
        agronomoNome: row.agronomoNome,
        agronomoEspecialidade: row.agronomoEspecialidade,
        atendimentoAvaliacaoEstrelas: row.atendimentoAvaliacaoEstrelas,
        atendimentoAvaliacaoComentario: row.atendimentoAvaliacaoComentario,
        atendimentoAvaliacaoEm: row.atendimentoAvaliacaoEm,
        dataSolicitacao: row.dataSolicitacao,
        dataAtualizacao: row.dataAtualizacao,
      },
      hybridConversations: hybridSummaries,
      primaryHybridId: primary ? primary.id : null,
      primaryHybridIaThreadId: primary ? primary.iaThreadId : null,
    });
  } catch (e) {
    console.error('adminConsultas detail:', e);
    return res.status(500).json({ message: 'Falha ao carregar consulta.' });
  }
});

/**
 * GET /api/admin/consultas?status=&q=&dateField=&dateFrom=&dateTo=&sort=&limit=&offset=
 * Lista tickets sem comentário de avaliação no payload (detalhe em GET /consultas/:id).
 * Contagem sem JOIN para evitar distorção com hasMany.
 */
router.get('/consultas', clerkAdminAuth, async (req, res) => {
  const { where, sort } = parseQueryFilters(req);
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(String(req.query.offset || '0'), 10) || 0, 0);
  const order = buildOrder(sort);

  try {
    const count = await ConsultaAgronomica.count({ where });

    const rows = await ConsultaAgronomica.findAll({
      where,
      order,
      limit,
      offset,
      include: [hybridIncludeList],
    });

    const items = rows.map((q) => {
      const h = pickPrimaryHybrid(q.hybridConversations || []);
      return mapListItem(q, h);
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
