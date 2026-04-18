const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const router = express.Router();

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
