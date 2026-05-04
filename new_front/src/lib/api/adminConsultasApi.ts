import { httpClient } from './httpClient';

export type AdminConsultaListItem = {
  id: string;
  status: string;
  urgencia: string;
  especialidade: string;
  assunto: string;
  preview: string;
  threadId: string | null;
  produtorClerkId: string;
  produtorNome: string;
  agronomoNome: string | null;
  agronomoClerkId: string | null;
  atendimentoAvaliacaoEstrelas: number | null;
  atendimentoAvaliacaoComentario: string | null;
  atendimentoAvaliacaoEm: string | null;
  dataSolicitacao: string;
  dataAtualizacao: string;
  hybridConversationId: string | null;
  hybridAtendimentoAtivo: boolean | null;
  hybridWhatsappMasked: string | null;
  hybridIaThreadId: string | null;
};

function clerkHeaders(clerkUserId: string): Record<string, string> {
  return { 'X-Clerk-User-Id': clerkUserId };
}

export async function getAdminAccess(clerkUserId: string) {
  return httpClient.get<{ clerkAdmin: boolean; configured: boolean }>('admin/access-check', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export async function listAdminConsultas(
  clerkUserId: string,
  params?: { status?: string; limit?: number; offset?: number }
) {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  const path = qs ? `admin/consultas?${qs}` : 'admin/consultas';
  return httpClient.get<{ total: number; limit: number; offset: number; items: AdminConsultaListItem[] }>(
    path,
    {
      headers: clerkHeaders(clerkUserId),
      cacheTtlMs: 0,
      forceRefresh: true,
    }
  );
}
