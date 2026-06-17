import { httpClient } from './httpClient';
import { getCachedClerkToken } from './authTokenStore';

export type DualProfileDto = {
  uf: string | null;
  municipio: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  tipo: string;
  notifAlertasCriticos: boolean;
  notifRelatorios: boolean;
  notifAtualizacoes: boolean;
};

function clerkHeaders(clerkUserId: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-Clerk-User-Id': clerkUserId };
  const token = getCachedClerkToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function getMyDualProfile(clerkUserId: string): Promise<DualProfileDto | null> {
  const res = await httpClient.get<{ profile: DualProfileDto | null }>('dual-profile/me', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
  });
  return res.profile ?? null;
}

export async function putMyDualProfile(
  clerkUserId: string,
  body: {
    uf?: string;
    municipio?: string;
    telefone?: string | null;
    nome?: string;
    email?: string;
    notifAlertasCriticos?: boolean;
    notifRelatorios?: boolean;
    notifAtualizacoes?: boolean;
  }
): Promise<DualProfileDto> {
  const res = await httpClient.put<{ profile: DualProfileDto }>('dual-profile/me', body, {
    headers: clerkHeaders(clerkUserId),
  });
  return res.profile;
}
