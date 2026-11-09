import { httpClient } from './httpClient';
import { getCachedClerkToken } from './authTokenStore';

export type WhatsappStatus = {
  /** O servidor tem o WhatsApp configurado. */
  disponivel: boolean;
  /** Número confirmado, mascarado (só os 4 últimos dígitos). */
  numero: string | null;
  verificado: boolean;
  alertasCriticos: boolean;
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

export function getWhatsappStatus(clerkUserId: string) {
  return httpClient.get<WhatsappStatus>('whatsapp/status', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export function enviarCodigoWhatsapp(clerkUserId: string, whatsapp: string) {
  return httpClient.post<{ success: boolean; message: string }>(
    'whatsapp/codigo',
    { whatsapp },
    { headers: clerkHeaders(clerkUserId) }
  );
}

export function confirmarCodigoWhatsapp(clerkUserId: string, codigo: string) {
  return httpClient.post<{ success: boolean; numero: string | null }>(
    'whatsapp/confirmar',
    { codigo },
    { headers: clerkHeaders(clerkUserId) }
  );
}

export function removerWhatsapp(clerkUserId: string) {
  return httpClient.delete<{ success: boolean }>('whatsapp', { headers: clerkHeaders(clerkUserId) });
}

/** Envia um relatório já gerado no navegador para o WhatsApp confirmado do usuário. */
export async function enviarRelatorioWhatsapp(
  clerkUserId: string,
  arquivo: { blob: Blob; filename: string; titulo: string }
): Promise<void> {
  const mime = arquivo.blob.type.split(';')[0] || 'application/octet-stream';
  const formData = new FormData();
  formData.append('file', new File([arquivo.blob], arquivo.filename, { type: mime }));
  formData.append('titulo', arquivo.titulo);
  formData.append('nomeArquivo', arquivo.filename);

  const response = await fetch(`${getApiBase()}/whatsapp/relatorio`, {
    method: 'POST',
    body: formData,
    headers: clerkHeaders(clerkUserId),
  });
  if (!response.ok) {
    const maybeJson = await response.json().catch(() => null);
    throw new Error(maybeJson?.message || 'Não foi possível enviar o relatório ao WhatsApp.');
  }
}
