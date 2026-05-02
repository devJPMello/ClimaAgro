import { httpClient } from './httpClient';

export type UnifiedChatMessage = {
  id: string;
  sender: 'user' | 'assistant' | 'agronomo';
  kind: 'ia' | 'hybrid';
  text: string;
  createdAt: string;
  tipo?: string;
  origem?: string;
  hasMidia?: boolean;
  midiaMimeType?: string | null;
};

export type HybridConversationDto = {
  id: string;
  intervencaoHumana: boolean;
  atendimentoAtivo: boolean;
  whatsappAgronomo: string;
  produtorNomeSnapshot?: string | null;
  casoResumoSnapshot?: string | null;
};

function clerkHeaders(clerkUserId: string): Record<string, string> {
  return { 'X-Clerk-User-Id': clerkUserId };
}

export async function getHybridTimeline(threadId: string, clerkUserId: string) {
  const encoded = encodeURIComponent(threadId);
  return httpClient.get<{
    threadId: string;
    conversation: HybridConversationDto | null;
    messages: UnifiedChatMessage[];
  }>(`hybrid-chat/timeline?threadId=${encoded}`, {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export type HybridConversationListItem = {
  id: string;
  iaThreadId: string;
  whatsappAgronomo: string;
  intervencaoHumana: boolean;
  atendimentoAtivo: boolean;
  updatedAt: string;
  produtorNomeSnapshot?: string | null;
  casoResumoSnapshot?: string | null;
};

export async function listHybridConversations(clerkUserId: string) {
  return httpClient.get<{ conversations: HybridConversationListItem[] }>('hybrid-chat/conversations', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export async function getHybridStatus(threadId: string, clerkUserId: string) {
  const encoded = encodeURIComponent(threadId);
  return httpClient.get<{
    conversation: HybridConversationDto | null;
    intervencaoHumana: boolean;
    atendimentoAtivo: boolean;
  }>(`hybrid-chat/status?threadId=${encoded}`, {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export type EscalatePayload = {
  threadId: string;
  whatsappAgronomo?: string;
  agronomoParceiroId?: string;
  produtorNome?: string;
  casoDestaque?: string;
  conciergeReason?: string;
  specialtyFilter?: string;
  autoPickBySpecialty?: boolean;
};

export async function escalateToSpecialist(payload: EscalatePayload, clerkUserId: string) {
  return httpClient.post<{
    success: boolean;
    conversationId: string;
    waUrl: string;
    summary: string;
    intervencaoHumana: boolean;
    atendimentoAtivo: boolean;
    agronomoNome?: string;
    agronomoEspecialidade?: string;
  }>('hybrid-chat/escalate', payload, { headers: clerkHeaders(clerkUserId) });
}

export type PatchHybridConversationBody = {
  atendimentoAtivo: boolean;
  avaliacaoEstrelas?: number;
  avaliacaoComentario?: string;
};

export async function patchHybridConversationStatus(
  conversationId: string,
  atendimentoAtivo: boolean,
  clerkUserId: string,
  avaliacao?: { estrelas: number; comentario?: string }
) {
  const body: PatchHybridConversationBody = { atendimentoAtivo };
  if (avaliacao && Number.isFinite(avaliacao.estrelas)) {
    body.avaliacaoEstrelas = Math.min(5, Math.max(1, Math.round(avaliacao.estrelas)));
    if (avaliacao.comentario?.trim()) {
      body.avaliacaoComentario = avaliacao.comentario.trim();
    }
  }
  return httpClient.patch<{
    success: boolean;
    conversationId: string;
    atendimentoAtivo: boolean;
    avaliacaoEstrelas?: number | null;
    avaliacaoComentario?: string | null;
    avaliacaoEm?: string | null;
  }>(`hybrid-chat/conversations/${encodeURIComponent(conversationId)}`, body, {
    headers: clerkHeaders(clerkUserId),
  });
}

export async function sendProducerToWhatsapp(
  conversationId: string,
  conteudo: string,
  clerkUserId: string
) {
  return httpClient.post<{
    success: boolean;
    message: { id: string; conteudo: string; createdAt: string };
    twilio?: { sent?: boolean; reason?: string };
  }>(`hybrid-chat/conversations/${encodeURIComponent(conversationId)}/messages`, { conteudo }, {
    headers: clerkHeaders(clerkUserId),
  });
}

function normalizeApiBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/\/api$/i.test(t)) return t;
  return `${t}/api`;
}

function getApiBasePath(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  const fromEnv = normalizeApiBaseUrl(raw);
  const pointsToLocalhost =
    !fromEnv || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw || fromEnv);
  if (import.meta.env.DEV && pointsToLocalhost) return '/api';
  if (fromEnv) return fromEnv;
  return '/api';
}

/** Baixa mídia do agrônomo (autenticado pelo Clerk no header). */
export async function fetchHybridMediaBlob(messageId: string, clerkUserId: string): Promise<Blob | null> {
  const base = getApiBasePath();
  const url = `${base}/hybrid-chat/media/${encodeURIComponent(messageId)}`;
  const response = await fetch(url, {
    headers: { 'X-Clerk-User-Id': clerkUserId },
  });
  if (!response.ok) return null;
  return await response.blob();
}

/** Origem do Socket.IO em dev (proxy Vite) vs produção (host da API). */
export function resolveSocketBaseUrl(): string {
  if (import.meta.env.DEV) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  const stripped = raw.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return stripped || (typeof window !== 'undefined' ? window.location.origin : '');
}
