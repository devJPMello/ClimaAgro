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
const { sequelize } = require('../config/database');
const { saveBuffer, readStoredFile, deleteStoredFile } = require('../services/iagroMediaStorage');

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
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
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

/**
 * Guarda imagens e PDFs no banco para a conversa mostrar a pré-visualização em qualquer aparelho.
 * Falha ao guardar não impede a resposta (a mensagem fica só com os nomes dos ficheiros).
 */
async function guardarAnexos(files) {
  const out = [];
  for (const file of files) {
    const mime = String(file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/');
    const isPdf = isPdfFile(file);
    if (!isImage && !isPdf) continue;
    try {
      const tipo = isPdf ? 'application/pdf' : mime;
      const key = await saveBuffer(file.buffer, tipo);
      out.push({ key, mime: tipo, name: String(file.originalname || (isPdf ? 'documento.pdf' : 'imagem')) });
    } catch (e) {
      console.error('IAgro: falha ao guardar anexo:', e.message);
    }
  }
  return out;
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
        'Nunca prescreva agrotóxicos (inseticidas, fungicidas, herbicidas etc.) com dose, volume de calda ou número de aplicações: pela Lei nº 14.785/2023 (art. 39), isso exige receita agronômica emitida por profissional legalmente habilitado. Você pode explicar o problema, o tipo de manejo e citar grupos químicos ou ingredientes ativos registrados para a cultura, e orientar o produtor a procurar um agrônomo para o receituário. Doses de referência de corretivos e fertilizantes podem ser informadas, deixando claro que dependem de análise de solo.',
        'Os dados do ClimaAgro (clima, produtividade e alertas) são agregados por estado; não os apresente como medições da propriedade do produtor.',
        orderedContext.length === 0
          ? 'Esta é a primeira mensagem da conversa: você pode começar com uma saudação curta.'
          : 'Esta conversa já está em andamento: NÃO comece com saudação (como "Olá", "Olá, produtor" ou "Oi"); vá direto à resposta.',
        'Não invente nem cite nomes de pessoas, agrônomos ou empresas.',
        'Quando o caso fugir do que pode ser resolvido com segurança apenas por chat (incerteza, laudo formal, receita agronômica, urgência fitossanitária), reconheça o limite e oriente o produtor a procurar um agrônomo ou técnico habilitado da sua região.',
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
          '4. **Fitossanidade**: tipo de manejo indicado (cultural, biológico ou químico) e, se for o caso, o grupo químico ou ingrediente ativo registrado para a cultura (consulta no Agrofit/MAPA), SEM dose, volume de calda ou número de aplicações de agrotóxico. Informe que a aplicação de agrotóxico exige receituário agronômico emitido por profissional habilitado.',
          '5. **Monitoramento**: o que observar nas próximas semanas.',
          '',
          '**Observação**: Se a qualidade da imagem não permitir diagnóstico preciso de algum item, informe claramente e oriente o produtor a enviar fotos mais próximas, em boa iluminação, de folhas afetadas e saudáveis para comparação.',
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

      const displayText = String(responseText).trim();
      if (!displayText) {
        return res.status(502).json({ message: 'Resposta inválida do modelo.' });
      }

      const fileNames = files.map((file) => file.originalname).filter(Boolean);
      const persistedMessage =
        fileNames.length > 0
          ? `${message || 'Arquivos enviados'}\n\n[Anexos: ${fileNames.join(', ')}]`
          : message;

      const attachments = await guardarAnexos(files);

      await ChatHistory.create({
        threadId,
        clerkUserId,
        message: persistedMessage,
        response: displayText,
        status: 'completed',
        isActive: true,
        isFavorite: threadIsFavorite,
        attachments: attachments.length ? attachments : null,
      });

      return res.json({
        threadId,
        response: displayText,
      });
    } catch (error) {
      if (error.statusCode === 403) {
        return res.status(403).json({ message: error.message || 'Acesso negado a esta conversa.' });
      }
      const { status, message } = geminiErrorToResponse(error, 'Falha ao processar mensagem do chat.');
      return res.status(status).json({ message });
    }
  }
);

/**
 * GET /api/ai/chat/media/:chatId/:index
 * Imagem/PDF enviado ao IAgro — apenas o dono da mensagem.
 */
router.get('/chat/media/:chatId/:index', aiReportLimiter, async (req, res) => {
  const clerkUserId = clerkUserIdFromReq(req);
  if (!clerkUserId) {
    return res.status(401).json({ message: 'Faça login para ver o anexo.' });
  }
  const index = Number.parseInt(String(req.params.index), 10);
  try {
    const row = await ChatHistory.findOne({
      where: { id: String(req.params.chatId), clerkUserId, isActive: true },
      attributes: ['id', 'attachments'],
    });
    const anexo = row && Array.isArray(row.attachments) ? row.attachments[index] : null;
    if (!anexo?.key) {
      return res.status(404).json({ message: 'Anexo não encontrado.' });
    }
    let buf;
    try {
      buf = await readStoredFile(anexo.key);
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ message: 'Este anexo não está mais disponível.' });
      throw err;
    }
    res.setHeader('Content-Type', anexo.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(buf);
  } catch (e) {
    if (e?.name === 'SequelizeDatabaseError') {
      return res.status(404).json({ message: 'Anexo não encontrado.' });
    }
    console.error('Erro ao ler anexo do IAgro:', e.message);
    return res.status(500).json({ message: 'Falha ao ler anexo.' });
  }
});

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
          attachments: (Array.isArray(row.attachments) ? row.attachments : []).map((a, index) => ({
            chatId: row.id,
            index,
            name: a.name || null,
            mimeType: a.mime || null,
          })),
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

router.get('/search', aiReportLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ message: 'Consulta muito curta (mínimo 2 caracteres).' });
  }

  const clerkUserId = clerkUserIdFromReq(req);
  if (!clerkUserId) {
    return res.status(401).json({ message: 'Faça login para pesquisar.' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT ON (thread_id)
         thread_id  AS "threadId",
         message,
         created_at AS "createdAt"
       FROM chat_history
       WHERE clerk_user_id = :userId
         AND is_active = true
         AND (
           to_tsvector('portuguese', coalesce(message, ''))  @@ plainto_tsquery('portuguese', :q)
           OR to_tsvector('portuguese', coalesce(response, '')) @@ plainto_tsquery('portuguese', :q)
         )
       ORDER BY thread_id, created_at ASC`,
      {
        replacements: { userId: clerkUserId, q },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const threads = rows.map((row) => ({
      threadId: row.threadId,
      title: String(row.message || '').slice(0, 80) || 'Conversa sem título',
      snippet: String(row.message || '').slice(0, 140),
      lastMessageAt: row.createdAt,
    }));

    return res.json({ threads });
  } catch (error) {
    console.error('Erro na busca do histórico IAgro:', error.message);
    return res.status(500).json({ message: 'Falha ao buscar no histórico.' });
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
    const comAnexos = await ChatHistory.findAll({
      where: { threadId, isActive: true, clerkUserId, attachments: { [Op.ne]: null } },
      attributes: ['id', 'attachments'],
    });
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
    // A conversa some da lista; os ficheiros enviados nela são apagados de vez.
    const chaves = comAnexos.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : []).map((a) => a.key));
    await Promise.all(chaves.map((k) => deleteStoredFile(k)));
    if (comAnexos.length) {
      await ChatHistory.update({ attachments: null }, { where: { id: comAnexos.map((r) => r.id) } });
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
      const { status, message } = geminiErrorToResponse(e, 'Falha ao gerar relatório.');
      return res.status(status).json({
        message,
        ...(process.env.NODE_ENV === 'development' && e.response?.data ? { detail: e.response.data } : {})
      });
    }
  }
);

/**
 * Traduz falhas da chamada ao Gemini em status e mensagem que o usuário entende.
 * Erros de cota, crédito ou chave do Gemini viram 503 (serviço indisponível),
 * para não parecer que o problema é do usuário.
 */
function geminiErrorToResponse(error, fallback) {
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return { status: 504, message: 'O assistente de IA demorou para responder. Tente novamente.' };
  }
  const upstream = error.response?.status;
  if (upstream === 429) {
    return {
      status: 503,
      message: 'O assistente de IA recebeu muitas consultas agora. Aguarde alguns instantes e tente de novo.',
    };
  }
  if (upstream === 400 || upstream === 401 || upstream === 402 || upstream === 403 || upstream === 404) {
    return {
      status: 503,
      message: 'O assistente de IA está indisponível no momento. Tente novamente mais tarde.',
    };
  }
  if (error.statusCode === 503) {
    return { status: 503, message: 'O assistente de IA está indisponível no momento. Tente novamente mais tarde.' };
  }
  if (error.statusCode && error.statusCode < 500) {
    return { status: error.statusCode, message: error.message || fallback };
  }
  return { status: 502, message: fallback };
}

module.exports = router;
module.exports.geminiErrorToResponse = geminiErrorToResponse;
