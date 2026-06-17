import { httpClient } from './httpClient';
import { getCachedClerkToken } from './authTokenStore';

export type IAgroMessage = {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

export type IAgroThread = {
  threadId: string;
  title: string;
  totalMessages: number;
  lastMessageAt: string;
  isFavorite?: boolean;
};

export type IAgroSearchResult = {
  threadId: string;
  title: string;
  snippet: string;
  lastMessageAt: string;
};

/** Triagem IA → humano (linha [META] parseada no backend). */
export type ConciergeMeta = {
  escalate: boolean;
  reason?: string;
  specialtyHint?: string;
};

function normalizeApiBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/\/api$/i.test(t)) return t;
  return `${t}/api`;
}

function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  const fromEnv = normalizeApiBaseUrl(raw);
  const pointsToLocalhost =
    !fromEnv || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw || fromEnv);
  if (import.meta.env.DEV && pointsToLocalhost) return '/api';
  if (fromEnv) return fromEnv;
  return '/api';
}

function clerkHeaders(clerkUserId: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-Clerk-User-Id': clerkUserId };
  const token = getCachedClerkToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function sendIAgroMessage(
  payload: { message: string; threadId?: string | null; files?: File[] },
  clerkUserId: string
) {
  const files = payload.files ?? [];
  if (files.length === 0) {
    return httpClient.post<{ threadId: string; response: string; concierge?: ConciergeMeta }>(
      'ai/chat/messages',
      {
        message: payload.message,
        threadId: payload.threadId ?? undefined,
      },
      { headers: clerkHeaders(clerkUserId) }
    );
  }

  const formData = new FormData();
  formData.append('message', payload.message ?? '');
  if (payload.threadId) {
    formData.append('threadId', payload.threadId);
  }
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${getApiBase()}/ai/chat/messages`, {
    method: 'POST',
    body: formData,
    headers: clerkHeaders(clerkUserId),
  });

  if (!response.ok) {
    const maybeJson = await response.json().catch(() => null);
    const message = maybeJson?.message || 'Falha ao enviar mensagem com anexos.';
    throw new Error(message);
  }

  return (await response.json()) as { threadId: string; response: string; concierge?: ConciergeMeta };
}

export async function listIAgroThreads(clerkUserId: string) {
  return httpClient.get<{ threads: IAgroThread[] }>('ai/chat/threads', {
    cacheTtlMs: 0,
    forceRefresh: true,
    headers: clerkHeaders(clerkUserId),
  });
}

export async function getIAgroHistory(threadId: string, clerkUserId: string) {
  const encoded = encodeURIComponent(threadId);
  return httpClient.get<{ threadId: string; messages: IAgroMessage[] }>(
    `ai/chat/history?threadId=${encoded}`,
    { cacheTtlMs: 0, forceRefresh: true, headers: clerkHeaders(clerkUserId) }
  );
}

export async function toggleIAgroThreadFavorite(threadId: string, isFavorite: boolean, clerkUserId: string) {
  const response = await fetch(`${getApiBase()}/ai/chat/threads/${encodeURIComponent(threadId)}/favorite`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...clerkHeaders(clerkUserId),
    },
    body: JSON.stringify({ isFavorite }),
  });
  if (!response.ok) {
    const maybeJson = await response.json().catch(() => null);
    throw new Error(maybeJson?.message || 'Falha ao atualizar favorito.');
  }
  return (await response.json()) as { success: boolean; threadId: string; isFavorite: boolean };
}

export async function searchIAgroThreads(q: string, clerkUserId: string) {
  return httpClient.get<{ threads: IAgroSearchResult[] }>(
    `ai/search?q=${encodeURIComponent(q)}`,
    { cacheTtlMs: 0, forceRefresh: true, headers: clerkHeaders(clerkUserId) }
  );
}

export async function deleteIAgroThread(threadId: string, clerkUserId: string) {
  const response = await fetch(`${getApiBase()}/ai/chat/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
    headers: clerkHeaders(clerkUserId),
  });
  if (!response.ok) {
    const maybeJson = await response.json().catch(() => null);
    throw new Error(maybeJson?.message || 'Falha ao excluir conversa.');
  }
  return (await response.json()) as { success: boolean; threadId: string };
}
