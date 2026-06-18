import { httpClient } from './httpClient';

export type AdminAgronomoStatus = 'pendente' | 'ativo' | 'todos';

export type AdminAgronomo = {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string;
  telefone?: string;
  municipio?: string;
  uf?: string;
  crea?: string;
  especialidade?: string;
  cpf?: string;
  parceiroAtivo: boolean;
  avaliacao?: number | null;
  totalAvaliacoes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminAgronomoPayload = {
  nome: string;
  email: string;
  whatsapp: string;
  especialidade: string;
  cpf?: string;
  telefone?: string;
  municipio?: string;
  uf?: string;
  crea?: string;
};

function adminHeaders(clerkUserId: string): Record<string, string> {
  return { 'X-Clerk-User-Id': clerkUserId };
}

export async function listarAdminAgronomos(clerkUserId: string, status?: AdminAgronomoStatus) {
  const q = new URLSearchParams();
  if (status && status !== 'todos') q.set('status', status);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return httpClient.get<{ agronomos: AdminAgronomo[] }>(`admin/agronomos${suffix}`, {
    headers: adminHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export async function criarAdminAgronomo(clerkUserId: string, payload: AdminAgronomoPayload) {
  return httpClient.post<{ success: boolean; message?: string }>('admin/agronomos', payload, {
    headers: adminHeaders(clerkUserId),
  });
}

export async function atualizarAdminAgronomo(
  clerkUserId: string,
  id: string,
  updates: Partial<AdminAgronomoPayload & { parceiroAtivo: boolean }>
) {
  return httpClient.patch<{ success: boolean; message?: string }>(`admin/agronomos/${id}`, updates, {
    headers: adminHeaders(clerkUserId),
  });
}

export async function excluirAdminAgronomo(clerkUserId: string, id: string) {
  return httpClient.delete<{ success: boolean; message?: string }>(`admin/agronomos/${id}`, {
    headers: adminHeaders(clerkUserId),
  });
}
