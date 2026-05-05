import { httpClient } from './httpClient';

export type DualProfileDto = {
  uf: string | null;
  municipio: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  tipo: string;
};

function clerkHeaders(clerkUserId: string): Record<string, string> {
  return { 'X-Clerk-User-Id': clerkUserId };
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
    uf: string;
    municipio: string;
    telefone?: string | null;
    nome: string;
    email: string;
  }
): Promise<DualProfileDto> {
  const res = await httpClient.put<{ profile: DualProfileDto }>('dual-profile/me', body, {
    headers: clerkHeaders(clerkUserId),
  });
  return res.profile;
}
