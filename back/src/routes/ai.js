const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const multer = require('multer');
const ChatHistory = require('../models/ChatHistory');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 6, fileSize: 8 * 1024 * 1024 },
});

const aiReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_REPORT_RATE_LIMIT_PER_MIN || 20),
  standardHeaders: true,
  legacyHeaders: false
});

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Entrada inválida', errors: errors.array() });
  }
  next();
};

function buildThreadContext(records = []) {
  if (!records.length) return 'Sem contexto anterior.';
  return records
    .map(
      (record) =>
        `Usuário: ${record.message}\nIAgro: ${record.response || 'Sem resposta registrada.'}`
    )
    .join('\n\n');
}

function extractGeminiText(responseData) {
  return responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGemini(prompt, responseMimeType = undefined) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY não configurada');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (responseMimeType) {
    payload.generationConfig = { responseMimeType };
  }

  const response = await axios.post(url, payload, {
    params: { key: apiKey },
    headers: { 'Content-Type': 'application/json' },
    timeout: timeoutMs,
  });

  return extractGeminiText(response.data);
}

async function callGeminiParts(parts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY não configurada');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

  const response = await axios.post(
    url,
    {
      contents: [{ role: 'user', parts }],
    },
    {
      params: { key: apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    }
  );

  return extractGeminiText(response.data);
}

function fileToTextAttachment(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = file.originalname || 'arquivo';
  const isTextLike =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript');
  if (!isTextLike) return null;
  const text = file.buffer.toString('utf8').slice(0, 12000);
  if (!text.trim()) return null;
  return `--- Arquivo anexado: ${name} (${mime || 'desconhecido'}) ---\n${text}`;
}

function buildPrompt(payload) {
  const history = (payload.historicoRelatorios || [])
    .slice(0, 6)
    .map(
      (item, index) =>
        `${index + 1}. ${item.tipo} | ${item.local} | ${item.periodo} | ${item.formato} | ${item.status} | ${item.data}`
    )
    .join('\n');

  return [
    'Voce e um analista climatico e agricola. Gere um resumo objetivo para um relatorio futuro.',
    'Use o contexto atual e aprenda com padroes dos relatorios antigos.',
    '',
    `Localidade: ${payload.localidade}`,
    `Tipo de relatorio: ${payload.tipoRelatorio}`,
    `Periodo: ${payload.periodoInicio} ate ${payload.periodoFim}`,
    `Formato final: ${payload.formato}`,
    '',
    'Historico de relatorios antigos:',
    history || 'Sem historico anterior.',
    '',
    `Instrucoes adicionais do usuario: ${payload.instrucoesUsuario || 'Nenhuma.'}`,
    '',
    'Responda em JSON valido com o formato:',
    '{"summary":"texto", "highlights":["item 1", "item 2", "item 3"]}'
  ].join('\n');
}

router.post(
  '/chat/messages',
  aiReportLimiter,
  upload.array('files', 6),
  async (req, res) => {
    const message = String(req.body.message || '').trim();
    const incomingThreadId = req.body.threadId ? String(req.body.threadId).trim() : null;
    const threadId = incomingThreadId || randomUUID();
    const files = Array.isArray(req.files) ? req.files : [];

    if (!message && files.length === 0) {
      return res.status(400).json({ message: 'Envie uma mensagem ou ao menos um arquivo.' });
    }
    if (message.length > 12000) {
      return res.status(400).json({ message: 'Mensagem excede o limite de 12.000 caracteres.' });
    }

    try {
      const recentRecords = await ChatHistory.findAll({
        where: {
          threadId,
          isActive: true,
          status: { [Op.ne]: 'error' },
        },
        order: [['createdAt', 'DESC']],
        limit: 8,
      });

      const orderedContext = [...recentRecords].reverse();
      const threadIsFavorite = Boolean(recentRecords[0]?.isFavorite);
      const context = buildThreadContext(orderedContext);
      const prompt = [
        'Você é o IAgro, assistente de clima e agricultura do ClimaAgro.',
        'Responda de forma objetiva, prática e em português do Brasil.',
        'Quando possível, destaque riscos climáticos e ações recomendadas.',
        '',
        'Histórico da conversa:',
        context,
        '',
        `Pergunta atual do usuário: ${message}`,
      ].join('\n');
      const textParts = [prompt];
      const imageParts = [];

      for (const file of files) {
        if (String(file.mimetype || '').startsWith('image/')) {
          imageParts.push({
            inlineData: {
              mimeType: file.mimetype,
              data: file.buffer.toString('base64'),
            },
          });
        } else {
          const extracted = fileToTextAttachment(file);
          if (extracted) {
            textParts.push(extracted);
          } else {
            textParts.push(`Arquivo anexado sem extração de texto: ${file.originalname}`);
          }
        }
      }

      const parts = [{ text: textParts.join('\n\n') }, ...imageParts];
      const responseText = imageParts.length > 0 || files.length > 0 ? await callGeminiParts(parts) : await callGemini(prompt);
      if (!responseText) {
        return res.status(502).json({ message: 'Resposta vazia do modelo.' });
      }

      const fileNames = files.map((file) => file.originalname).filter(Boolean);
      const persistedMessage =
        fileNames.length > 0
          ? `${message || 'Arquivos enviados'}\n\n[Anexos: ${fileNames.join(', ')}]`
          : message;

      await ChatHistory.create({
        threadId,
        message: persistedMessage,
        response: responseText,
        status: 'completed',
        isActive: true,
        isFavorite: threadIsFavorite,
      });

      return res.json({
        threadId,
        response: responseText,
      });
    } catch (error) {
      const status = error.statusCode || error.response?.status;
      const messageText =
        error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          ? 'Timeout ao chamar Gemini.'
          : error.message || 'Falha ao processar mensagem do chat.';
      return res.status(status && status < 500 ? status : 502).json({
        message: messageText,
      });
    }
  }
);

router.get('/chat/threads', async (req, res) => {
  try {
    const rows = await ChatHistory.findAll({
      where: { isActive: true },
      order: [['updatedAt', 'DESC']],
      limit: 1000,
    });

    const byThread = new Map();
    for (const row of rows) {
      const key = row.threadId;
      const existing = byThread.get(key);
      if (!existing) {
        byThread.set(key, {
          threadId: key,
          title: row.message?.slice(0, 80) || 'Conversa sem título',
          totalMessages: 1,
          lastMessageAt: row.updatedAt,
          isFavorite: Boolean(row.isFavorite),
        });
      } else {
        existing.totalMessages += 1;
        if (row.isFavorite) {
          existing.isFavorite = true;
        }
      }
    }

    const threads = [...byThread.values()].sort(
      (a, b) => {
        if (a.isFavorite !== b.isFavorite) {
          return a.isFavorite ? -1 : 1;
        }
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
    );
    return res.json({ threads });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao buscar lista de conversas.' });
  }
});

router.get('/chat/history', async (req, res) => {
    const threadId = String(req.query.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json({ message: 'threadId é obrigatório.' });
    }

    try {
      const rows = await ChatHistory.findAll({
        where: {
          threadId,
          isActive: true,
        },
        order: [['createdAt', 'ASC']],
      });

      const messages = rows.flatMap((row) => [
        {
          id: `${row.id}-user`,
          sender: 'user',
          text: row.message,
          createdAt: row.createdAt,
        },
        {
          id: `${row.id}-assistant`,
          sender: 'assistant',
          text: row.response,
          createdAt: row.updatedAt || row.createdAt,
        },
      ]);

      return res.json({ threadId, messages });
    } catch (error) {
      return res.status(500).json({ message: 'Falha ao buscar histórico da conversa.' });
    }
  });

router.patch('/chat/threads/:threadId/favorite', async (req, res) => {
  const threadId = String(req.params.threadId || '').trim();
  const isFavorite = Boolean(req.body?.isFavorite);
  if (!threadId) {
    return res.status(400).json({ message: 'threadId é obrigatório.' });
  }

  try {
    const [updated] = await ChatHistory.update(
      { isFavorite },
      {
        where: {
          threadId,
          isActive: true,
        },
      }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Conversa não encontrada.' });
    }
    return res.json({ success: true, threadId, isFavorite });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao atualizar favorito da conversa.' });
  }
});

router.delete('/chat/threads/:threadId', async (req, res) => {
  const threadId = String(req.params.threadId || '').trim();
  if (!threadId) {
    return res.status(400).json({ message: 'threadId é obrigatório.' });
  }

  try {
    const [updated] = await ChatHistory.update(
      { isActive: false },
      {
        where: {
          threadId,
          isActive: true,
        },
      }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Conversa não encontrada.' });
    }
    return res.json({ success: true, threadId });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao excluir conversa.' });
  }
});

router.post(
  '/reports/generate',
  aiReportLimiter,
  [
    body('localidade').isString().trim().isLength({ min: 2, max: 200 }),
    body('tipoRelatorio').isString().trim().isLength({ min: 2, max: 120 }),
    body('periodoInicio').isISO8601(),
    body('periodoFim').isISO8601(),
    body('formato').isString().trim().isLength({ min: 1, max: 40 }),
    body('historicoRelatorios').optional().isArray({ max: 20 }),
    body('instrucoesUsuario').optional().isString().isLength({ max: 2000 }),
    validateRequest
  ],
  async (req, res) => {
    const payload = {
      ...req.body,
      historicoRelatorios: Array.isArray(req.body.historicoRelatorios) ? req.body.historicoRelatorios : []
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        message:
          'Serviço de IA indisponível: GEMINI_API_KEY não configurada no servidor (nunca use chave no navegador).'
      });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const prompt = buildPrompt(payload);
    if (prompt.length > 12000) {
      return res.status(400).json({ message: 'Prompt excede o limite seguro do servidor.' });
    }

    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

    try {
      const response = await axios.post(
        url,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        },
        {
          params: { key: apiKey },
          headers: { 'Content-Type': 'application/json' },
          timeout: timeoutMs
        }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) {
        return res.status(502).json({ message: 'Resposta vazia do modelo.' });
      }
      try {
        const parsed = JSON.parse(raw);
        return res.json({
          summary: String(parsed.summary || ''),
          highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String) : []
        });
      } catch {
        return res.json({ summary: String(raw), highlights: [] });
      }
    } catch (e) {
      const status = e.response?.status;
      const msg =
        e.code === 'ECONNABORTED' || e.message?.includes('timeout')
          ? 'Timeout ao chamar Gemini.'
          : 'Falha ao gerar relatório.';
      return res.status(status && status < 500 ? status : 502).json({
        message: msg,
        ...(process.env.NODE_ENV === 'development' && e.response?.data ? { detail: e.response.data } : {})
      });
    }
  }
);

module.exports = router;
