import { httpClient } from './httpClient';
import { getCachedClerkToken } from './authTokenStore';

export type TipoRegistro = 'plantio' | 'adubacao' | 'aplicacao' | 'praga_doenca' | 'colheita' | 'observacao';

export type RegistroDiario = {
  id: string;
  data: string;
  tipo: TipoRegistro;
  cultura: string | null;
  uf: string;
  municipio: string | null;
  observacao: string | null;
  anexos: Array<{ nome: string; tipo: string }>;
  criadoEm: string;
};

export type ResumoClima = {
  dias: number;
  chuvaMm: number | null;
  tempMedia: number | null;
  diasComChuva: number | null;
};

export type ClimaDoRegistro = {
  uf: string;
  data: string;
  janelaDias: number;
  antes: ResumoClima | null;
  depois: ResumoClima | null;
};

export type NovoRegistro = {
  data: string;
  tipo: TipoRegistro;
  cultura: string;
  uf: string;
  municipio: string;
  observacao: string;
  fotos: File[];
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

export async function listarRegistros(clerkUserId: string): Promise<RegistroDiario[]> {
  const r = await httpClient.get<{ registros: RegistroDiario[] }>('diario', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
  return r.registros ?? [];
}

export async function criarRegistro(clerkUserId: string, novo: NovoRegistro): Promise<void> {
  const form = new FormData();
  form.append('data', novo.data);
  form.append('tipo', novo.tipo);
  form.append('cultura', novo.cultura);
  form.append('uf', novo.uf);
  form.append('municipio', novo.municipio);
  form.append('observacao', novo.observacao);
  novo.fotos.forEach((f) => form.append('files', f));

  const response = await fetch(`${getApiBase()}/diario`, {
    method: 'POST',
    body: form,
    headers: clerkHeaders(clerkUserId),
  });
  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    throw new Error(corpo?.message || 'Não foi possível salvar o registro.');
  }
}

export function apagarRegistro(clerkUserId: string, id: string) {
  return httpClient.delete<{ success: boolean }>(`diario/${encodeURIComponent(id)}`, {
    headers: clerkHeaders(clerkUserId),
  });
}

export function climaDoRegistro(clerkUserId: string, id: string) {
  return httpClient.get<ClimaDoRegistro>(`diario/${encodeURIComponent(id)}/clima`, {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

/** Envia o registro (texto, clima do período e fotos) ao WhatsApp confirmado do próprio usuário. */
export function enviarRegistroWhatsapp(clerkUserId: string, id: string) {
  return httpClient.post<{ success: boolean; fotosEnviadas: number; fotosTotal: number }>(
    `diario/${encodeURIComponent(id)}/whatsapp`,
    {},
    { headers: clerkHeaders(clerkUserId) }
  );
}

/** Baixa uma foto do registro; só o dono consegue. */
export async function baixarFoto(clerkUserId: string, id: string, index: number): Promise<Blob | null> {
  const response = await fetch(`${getApiBase()}/diario/${encodeURIComponent(id)}/anexo/${index}`, {
    headers: clerkHeaders(clerkUserId),
  });
  return response.ok ? response.blob() : null;
}
