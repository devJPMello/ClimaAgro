import { ApiError } from './errors';
import { httpClient } from './httpClient';
import type { AiReportGenerationRequestDto, AiReportGenerationResponseDto } from './contracts/aiReports';

const DEFAULT_MODEL = 'gemini-1.5-flash';

function buildPrompt(payload: AiReportGenerationRequestDto): string {
  const history = payload.historicoRelatorios
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
    '{"summary":"texto", "highlights":["item 1", "item 2", "item 3"]}',
  ].join('\n');
}

async function callGeminiDirectly(payload: AiReportGenerationRequestDto): Promise<AiReportGenerationResponseDto> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiError('VITE_GEMINI_API_KEY nao configurada para uso direto da API Gemini.', 0);
  }

  const model = import.meta.env.VITE_GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint =
    import.meta.env.VITE_GEMINI_API_URL ||
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(payload) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError('Falha ao gerar relatorio com Gemini.', response.status, body);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    throw new ApiError('Resposta da Gemini vazia.', 502, data);
  }

  try {
    return JSON.parse(raw) as AiReportGenerationResponseDto;
  } catch {
    return { summary: raw, highlights: [] };
  }
}

export async function generateAiReport(payload: AiReportGenerationRequestDto): Promise<AiReportGenerationResponseDto> {
  const backendEndpoint = import.meta.env.VITE_AI_REPORTS_ENDPOINT || 'ai/reports/generate';
  const isProd = import.meta.env.PROD;
  const preferDirectGemini = import.meta.env.VITE_USE_DIRECT_GEMINI === 'true';

  if (preferDirectGemini && !isProd) {
    return callGeminiDirectly(payload);
  }

  if (preferDirectGemini && isProd) {
    throw new ApiError(
      'VITE_USE_DIRECT_GEMINI nao e suportado em producao. Use o backend (GEMINI_API_KEY no servidor) e Authorization se aplicavel.',
      0
    );
  }

  return httpClient.post<AiReportGenerationResponseDto>(backendEndpoint, payload);
}
