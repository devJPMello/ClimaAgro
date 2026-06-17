const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const ChatHistory = require('../models/ChatHistory');
const { buildIagroDataContext } = require('../services/iagroDataContextService');
const { clerkAuth } = require('../middleware/clerkAuth');

const MAX_ATTACHMENT_TEXT_CHARS = 12000;

const router = express.Router();
router.use(clerkAuth);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 6, fileSize: 8 * 1024 * 1024 },
});

function clerkUserIdFromReq(req) {
  return String(req.clerkUserId || req.headers['x-clerk-user-id'] || '').trim();
}

/** Impede escrita em thread de outro usuário; atribui clerk aos registros legados sem dono. */
async function ensureThreadWritable(threadId, clerkUserId) {
  const hostile = await ChatHistory.findOne({
    where: {
      threadId,
      isActive: true,
      [Op.and]: [
        { clerkUserId: { [Op.ne]: null } },
        { clerkUserId: { [Op.ne]: clerkUserId } },
      ],
    },
  });
  if (hostile) {
    const err = new Error('Conversa pertence a outro usuário.');
    err.statusCode = 403;
    throw err;
  }
  await ChatHistory.update(
    { clerkUserId },
    { where: { threadId, isActive: true, clerkUserId: { [Op.is]: null } } }
  );
}

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

const CONCIERGE_FOOTER = [
  '---',
  'Ao final da sua resposta ao produtor, acrescente OBRIGATORIAMENTE uma linha adicional, sozinha, exatamente neste formato (JSON minificado, sem crases ou markdown):',
  '[META]{"escalate":false,"reason":"","specialtyHint":""}',
  'Regras para "escalate": true (somente se aplicável):',
  '(A) Nesta mensagem o produtor enviou imagem ou PDF E há incerteza relevante, risco à lavoura, necessidade de laudo CREA/receituário/ofício, ou confirmação em laboratório ou visita; OU',
  '(B) Nesta mensagem o produtor pediu explicitamente falar com agrônomo, especialista, visita técnica ou atendimento humano.',
  'Para conversa apenas em texto, sem anexo nesta mensagem e sem pedido explícito de humano, use em geral "escalate": false (orientações gerais e monitoramento não disparam triagem).',
  'Em "reason" resuma em uma frase o motivo. Em "specialtyHint" indique a área (ex.: "Pragas", "Fitossanidade", "Solos", "Irrigação").',
  'Exemplo: [META]{"escalate":true,"reason":"Imagem ambígua; possível ferrugem asiática.","specialtyHint":"Fitossanidade"}',
].join('\n');

function normalizeConcierge(parsed) {
  return {
    escalate: Boolean(parsed && parsed.escalate),
    reason: String((parsed && parsed.reason) || '').slice(0, 800),
    specialtyHint: String((parsed && parsed.specialtyHint) || '').slice(0, 160),
  };
}

/**
 * Remove a linha [META]{...} do final e devolve metadados para triagem humana.
 */
function splitConciergeMeta(raw) {
  const empty = { escalate: false, reason: '', specialtyHint: '' };
  if (!raw || typeof raw !== 'string') {
    return { displayText: '', concierge: empty };
  }
  const trimmed = raw.trimEnd();
  const lineRe = /\n\[META\](\{[\s\S]*\})\s*$/;
  const m1 = trimmed.match(lineRe);
  if (m1) {
    try {
      const parsed = JSON.parse(m1[1]);
      const displayText = trimmed.slice(0, m1.index).trimEnd();
      return { displayText, concierge: normalizeConcierge(parsed) };
    } catch {
      return { displayText: trimmed, concierge: empty };
    }
  }
  const lines = trimmed.split('\n');
  const last = lines[lines.length - 1];
  if (last && last.trim().startsWith('[META]')) {
    try {
      const jsonStr = last.replace(/^\[META\]/, '').trim();
      const parsed = JSON.parse(jsonStr);
      const displayText = lines.slice(0, -1).join('\n').trimEnd();
      return { displayText, concierge: normalizeConcierge(parsed) };
    } catch {
      return { displayText: trimmed, concierge: empty };
    }
  }
  return { displayText: trimmed, concierge: empty };
}

/** Produtor pediu encaminhamento humano explícito no texto desta mensagem (sem depender do modelo). */
function userRequestsHumanHelp(message) {
  const m = String(message || '').toLowerCase();
  if (!m.trim()) return false;
  const patterns = [
    /\bagr[oô]nomo\b/,
    /\bespecialista\b/,
    /\batendimento\s+humano\b/,
    /\batendimento\s+presencial\b/,
    /\bvisita\s+t[eé]cnica\b/,
    /\bpreciso\s+de\s+(um\s+)?(agr[oô]nomo|especialista|t[eé]cnico)\b/,
    /\bquero\s+(falar|conversar)\s+com\s+(um\s+)?(agr[oô]nomo|especialista|t[eé]cnico)\b/,
    /\bfalar\s+com\s+(um\s+)?(agr[oô]nomo|especialista|t[eé]cnico)\b/,
    /\bencaminhar\s+(para\s+)?(um\s+)?(agr[oô]nomo|especialista)\b/,
    /\bcontato\s+(do|com)\s+(o\s+)?(agr[oô]nomo|especialista)\b/,
    /\bpreciso\s+falar\s+com\b/,
    /\bwhatsapp\s+(do\s+)?(agr[oô]nomo|especialista)\b/,
    /\blaudo\s+crea\b/,
    /\breceitu[aá]rio\b.*\b(agr[oô]nomo|defensivo)\b/,
  ];
  return patterns.some((re) => re.test(m));
}

/**
 * Triagem humana na UI só quando há anexo nesta mensagem OU pedido explícito de especialista.
 * Evita cartão de parceiro e nomes em todo turno de chat só texto.
 */
function gateConciergeEscalation(concierge, { hasAttachments, explicitHuman }) {
  const empty = { escalate: false, reason: '', specialtyHint: '' };
  if (hasAttachments || explicitHuman) {
    return {
      escalate: Boolean(concierge && concierge.escalate),
      reason: String((concierge && concierge.reason) || '').slice(0, 800),
      specialtyHint: String((concierge && concierge.specialtyHint) || '').slice(0, 160),
    };
  }
  return empty;
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

function isPdfFile(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime === 'application/x-pdf' ||
    String(file.originalname || '')
      .toLowerCase()
      .endsWith('.pdf')
  );
}

/** Camada de texto (rápida). PDF escaneado costuma vir vazio — o modelo ainda recebe o PDF inline. */
async function extractPdfPlainText(buffer) {
  const data = await pdfParse(buffer);
  const raw = String(data.text || '')
    .replace(/\u00a0/g, ' ')
    .trim();
  return raw.replace(/\s+/g, ' ').slice(0, MAX_ATTACHMENT_TEXT_CHARS);
}

/**
 * Extrai texto de anexos que não são PDF (txt, json, etc.).
 */
function extractNonPdfTextAttachment(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = file.originalname || 'arquivo';
  const isTextLike =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript');
  if (!isTextLike) return null;
  const plain = file.buffer.toString('utf8').slice(0, MAX_ATTACHMENT_TEXT_CHARS);
  if (!plain.trim()) return null;
  return `--- Arquivo anexado: ${name} (${mime || 'desconhecido'}) ---\n${plain}`;
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

    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login para usar o IAgro.' });
    }

    try {
      await ensureThreadWritable(threadId, clerkUserId);

      const recentRecords = await ChatHistory.findAll({
        where: {
          threadId,
          isActive: true,
          status: { [Op.ne]: 'error' },
          clerkUserId,
        },
        order: [['createdAt', 'DESC']],
        limit: 8,
      });

      const orderedContext = [...recentRecords].reverse();
      const threadIsFavorite = Boolean(recentRecords[0]?.isFavorite);
      const context = buildThreadContext(orderedContext);
      const dataContext = await buildIagroDataContext(clerkUserId);
      const hasImages = files.some((f) => String(f.mimetype || '').startsWith('image/'));
      const hasPdf = files.some((f) => isPdfFile(f));

      const systemRole = [
        'Você é o IAgro, assistente agrônomo especialista do ClimaAgro.',
        'Você tem conhecimento profundo em fitotecnia, nutrição de plantas, manejo do solo, climatologia agrícola e boas práticas agropecuárias brasileiras.',
        'Responda sempre em português do Brasil, de forma objetiva e prática, como um agrônomo experiente falando com um produtor rural.',
        'Use formatação Markdown para organizar suas respostas (títulos, listas, negrito).',
        'Quando pertinente, embase suas recomendações em referências técnicas brasileiras (Embrapa, IAC, CREA, MAPA).',
        'No texto principal da resposta, NÃO invente nem cite nomes de pessoas, agrônomos ou empresas parceiras. O aplicativo encaminha a parceiros cadastrados quando for o caso — use apenas a linha [META] para sinalizar necessidade de humano, sem nomes próprios.',
        'Quando perceber que o caso foge do que pode ser resolvido com segurança apenas por chat (incerteza, laudo formal, receituário agronômico, urgência fitossanitária), reconheça o limite — isso será sinalizado ao sistema na linha [META] final, conforme as regras do rodapé.',
        CONCIERGE_FOOTER,
      ].join('\n');

      const prompt = [
        systemRole,
        ...(dataContext ? ['', dataContext] : []),
        '',
        'Histórico da conversa:',
        context,
        '',
        `Pergunta atual do usuário: ${message || (hasImages ? 'Analise a imagem desta planta.' : hasPdf ? 'Analise o(s) documento(s) PDF anexado(s).' : '')}`,
      ].join('\n');

      const textParts = [prompt];
      const imageParts = [];
      const pdfInlineParts = [];
      let pdfInstructionAdded = false;

      for (const file of files) {
        if (String(file.mimetype || '').startsWith('image/')) {
          imageParts.push({
            inlineData: {
              mimeType: file.mimetype,
              data: file.buffer.toString('base64'),
            },
          });
        } else if (isPdfFile(file) && file.buffer?.length) {
          const name = file.originalname || 'documento.pdf';
          let plain = '';
          let parseFailed = false;
          try {
            plain = await extractPdfPlainText(file.buffer);
          } catch (e) {
            parseFailed = true;
            console.error('pdf-parse error:', e.message);
            textParts.push(
              `[PDF "${name}": falha na extração local de texto (${e.message || 'erro'}). O PDF completo foi anexado para leitura pelo modelo.]`
            );
          }
          if (plain) {
            textParts.push(`--- Texto extraído do PDF (${name}) ---\n${plain}`);
          } else if (!parseFailed) {
            textParts.push(
              `[PDF "${name}": pouco ou nenhum texto na camada digital — o arquivo PDF foi anexado; interprete também páginas escaneadas ou figuras.]`
            );
          }
          if (!pdfInstructionAdded) {
            textParts.push(
              [
                '## PDF anexo (multimodal)',
                'Além do texto acima (quando houver), use o PDF enviado como parte da mensagem: leia texto, tabelas e descreva imagens manuscritas ou impressas visíveis nas páginas.',
              ].join('\n')
            );
            pdfInstructionAdded = true;
          }
          pdfInlineParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: file.buffer.toString('base64'),
            },
          });
        } else {
          const extracted = extractNonPdfTextAttachment(file);
          if (extracted) {
            textParts.push(extracted);
          } else {
            textParts.push(`Arquivo anexado sem extração de texto: ${file.originalname}`);
          }
        }
      }

      if (imageParts.length > 0) {
        textParts.push([
          '## INSTRUÇÃO: LAUDO AGRONÔMICO VISUAL',
          '',
          'Você está recebendo uma ou mais imagens de plantas/lavoura. Realize um laudo agronômico visual completo.',
          'Siga EXATAMENTE esta estrutura na sua resposta:',
          '',
          '### 1. Identificação da Cultura',
          '- Identifique a espécie ou cultura (soja, milho, feijão, café, pastagem, hortaliça, etc.).',
          '- Se não for possível identificar, descreva o que vê.',
          '- Indique o estágio fenológico aparente.',
          '',
          '### 2. Estado Geral',
          '- Avalie vigor, porte e coloração geral.',
          '- Classifique: Saudável / Estresse leve / Estresse moderado / Estresse severo.',
          '',
          '### 3. Deficiências Nutricionais',
          'Analise os sintomas foliares com base neste guia de referência:',
          '- **N (Nitrogênio)**: amarelecimento das folhas velhas (baixeiras), verde-amarelado generalizado, crescimento reduzido.',
          '- **P (Fósforo)**: coloração roxa/avermelhada em folhas e caule, folhas escuras, raízes pouco desenvolvidas.',
          '- **K (Potássio)**: necrose e queima das bordas foliares (escorch), iniciando nas folhas velhas.',
          '- **Ca (Cálcio)**: necrose e distorção das folhas novas e ponteiros, frutos deformados — indica possível acidez do solo.',
          '- **Mg (Magnésio)**: clorose internerval nas folhas velhas (nervuras verdes, tecido entre-nervuras amarelo).',
          '- **S (Enxofre)**: amarelecimento uniforme das folhas jovens (ponteiros), semelhante ao N mas nas folhas novas.',
          '- **Fe (Ferro)**: clorose internerval nas folhas jovens, nervuras verdes com tecido amarelo.',
          '- **Mn (Manganês)**: clorose internerval nas folhas jovens, manchas cinzas ou marrons entre nervuras.',
          '- **Zn (Zinco)**: folhas pequenas, internódios curtos, bronzeamento ou manchas amarelas nas folhas jovens.',
          '- **B (Boro)**: morte dos pontos de crescimento, folhas deformadas e espessas, frutos com rachaduras.',
          'Liste cada deficiência suspeita com probabilidade (alta / média / baixa) e o sintoma observado.',
          '',
          '### 4. Necessidade de Calagem',
          'Avalie sinais de acidez do solo ou necessidade de calcário:',
          '- Deficiências de Ca e Mg simultâneas → forte indício de pH baixo.',
          '- Toxidez de Al ou Mn (manchas necróticas marrons generalizadas) → solo ácido.',
          '- Crescimento muito reduzido sem causa aparente de seca ou praga.',
          'Conclua com uma das opções: **Calagem provavelmente necessária** / **Possível necessidade** / **Sem indícios visíveis**.',
          'Se indicada, sugira: tipo de calcário (calcítico para Ca, dolomítico para Ca+Mg), dose de referência (t/ha) e modo de aplicação.',
          '',
          '### 5. Pragas e Doenças',
          '- Descreva manchas, lesões, ferrugem, murchas, podridões, galhas, insetos ou ovos visíveis.',
          '- Indique o agente causal provável (fungo, bactéria, vírus, nematoide, inseto).',
          '- Classifique a urgência: Ação imediata / Monitorar / Sem indícios.',
          '',
          '### 6. Plano de Ação (em ordem de prioridade)',
          '1. **Urgente**: ações imediatas se houver risco de perda.',
          '2. **Correção do solo**: calagem e/ou gessagem recomendada.',
          '3. **Adubação**: nutriente prioritário, produto sugerido e dose de referência.',
          '4. **Fitossanidade**: defensivo indicado, dose e modo de aplicação.',
          '5. **Monitoramento**: o que observar nas próximas semanas.',
          '',
          '**Observação**: Se a qualidade da imagem não permitir diagnóstico preciso de algum item, informe claramente e oriente o produtor a enviar fotos mais próximas, em boa iluminação, de folhas afetadas e saudáveis para comparação.',
          '',
          CONCIERGE_FOOTER,
        ].join('\n'));
      }

      const parts = [{ text: textParts.join('\n\n') }, ...imageParts, ...pdfInlineParts];
      const responseText =
        imageParts.length > 0 || pdfInlineParts.length > 0 || files.length > 0
          ? await callGeminiParts(parts)
          : await callGemini(prompt);
      if (!responseText) {
        return res.status(502).json({ message: 'Resposta vazia do modelo.' });
      }

      const { displayText, concierge } = splitConciergeMeta(responseText);
      if (!displayText.trim()) {
        return res.status(502).json({ message: 'Resposta inválida do modelo após triagem.' });
      }

      const hasAttachments = files.length > 0;
      const explicitHuman = userRequestsHumanHelp(message);
      const conciergeOut = gateConciergeEscalation(concierge, {
        hasAttachments,
        explicitHuman,
      });

      const fileNames = files.map((file) => file.originalname).filter(Boolean);
      const persistedMessage =
        fileNames.length > 0
          ? `${message || 'Arquivos enviados'}\n\n[Anexos: ${fileNames.join(', ')}]`
          : message;

      await ChatHistory.create({
        threadId,
        clerkUserId,
        message: persistedMessage,
        response: displayText,
        status: 'completed',
        isActive: true,
        isFavorite: threadIsFavorite,
      });

      return res.json({
        threadId,
        response: displayText,
        concierge: conciergeOut,
      });
    } catch (error) {
      if (error.statusCode === 403) {
        return res.status(403).json({ message: error.message || 'Acesso negado a esta conversa.' });
      }
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

router.get('/chat/threads', aiReportLimiter, async (req, res) => {
  try {
    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login para ver suas conversas.' });
    }

    const rows = await ChatHistory.findAll({
      where: { isActive: true, clerkUserId },
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

router.get('/chat/history', aiReportLimiter, async (req, res) => {
    const threadId = String(req.query.threadId || '').trim();
    if (!threadId) {
      return res.status(400).json({ message: 'threadId é obrigatório.' });
    }

    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login para ver o histórico.' });
    }

    try {
      const rows = await ChatHistory.findAll({
        where: {
          threadId,
          isActive: true,
          clerkUserId,
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
  const clerkUserId = clerkUserIdFromReq(req);
  if (!threadId) {
    return res.status(400).json({ message: 'threadId é obrigatório.' });
  }
  if (!clerkUserId) {
    return res.status(401).json({ message: 'Faça login para alterar favoritos.' });
  }

  try {
    const [updated] = await ChatHistory.update(
      { isFavorite },
      {
        where: {
          threadId,
          isActive: true,
          clerkUserId,
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
  const clerkUserId = clerkUserIdFromReq(req);
  if (!threadId) {
    return res.status(400).json({ message: 'threadId é obrigatório.' });
  }
  if (!clerkUserId) {
    return res.status(401).json({ message: 'Faça login para remover conversas.' });
  }

  try {
    const [updated] = await ChatHistory.update(
      { isActive: false },
      {
        where: {
          threadId,
          isActive: true,
          clerkUserId,
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
