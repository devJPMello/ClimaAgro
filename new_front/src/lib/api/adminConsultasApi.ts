import { ApiError } from './errors';
import { httpClient, resolveApiUrl } from './httpClient';

/** Lista: sem comentário de avaliação (ver detalhe GET /admin/consultas/:id). */
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
  dataSolicitacao: string;
  dataAtualizacao: string;
  hybridConversationId: string | null;
  hybridAtendimentoAtivo: boolean | null;
  hybridWhatsappMasked: string | null;
  hybridIaThreadId: string | null;
};

export type AdminConsultaDetailConsulta = {
  id: string;
  status: string;
  urgencia: string;
  especialidade: string;
  assunto: string;
  preview: string;
  conversa: string;
  threadId: string | null;
  produtorClerkId: string;
  produtorNome: string;
  produtorEmail: string | null;
  produtorTelefone: string | null;
  produtorMunicipio: string | null;
  produtorUf: string | null;
  agronomoClerkId: string | null;
  agronomoNome: string | null;
  agronomoEspecialidade: string | null;
  atendimentoAvaliacaoEstrelas: number | null;
  atendimentoAvaliacaoComentario: string | null;
  atendimentoAvaliacaoEm: string | null;
  dataSolicitacao: string;
  dataAtualizacao: string;
};

export type AdminConsultaDetailHybrid = {
  id: string;
  iaThreadId: string;
  atendimentoAtivo: boolean;
  intervencaoHumana: boolean;
  updatedAt: string;
  createdAt: string;
  whatsappMasked: string;
};

export type AdminConsultaDetailResponse = {
  consulta: AdminConsultaDetailConsulta;
  hybridConversations: AdminConsultaDetailHybrid[];
  primaryHybridId: string | null;
  primaryHybridIaThreadId: string | null;
};

export type AdminConsultaListParams = {
  status?: string;
  urgencia?: string;
  q?: string;
  dateField?: 'atualizacao' | 'solicitacao';
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  limit?: number;
  offset?: number;
};

function clerkHeaders(clerkUserId: string): Record<string, string> {
  return { 'X-Clerk-User-Id': clerkUserId };
}

function buildListQueryString(params: AdminConsultaListParams): string {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.urgencia) q.set('urgencia', params.urgencia);
  if (params.q) q.set('q', params.q);
  if (params.dateField) q.set('dateField', params.dateField);
  if (params.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params.dateTo) q.set('dateTo', params.dateTo);
  if (params.sort) q.set('sort', params.sort);
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  return q.toString();
}

export async function getAdminAccess(clerkUserId: string) {
  return httpClient.get<{ clerkAdmin: boolean; configured: boolean }>('admin/access-check', {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export async function listAdminConsultas(clerkUserId: string, params?: AdminConsultaListParams) {
  const qs = params ? buildListQueryString(params) : '';
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

export async function getAdminConsultaDetail(clerkUserId: string, consultaId: string) {
  const encoded = encodeURIComponent(consultaId);
  return httpClient.get<AdminConsultaDetailResponse>(`admin/consultas/${encoded}`, {
    headers: clerkHeaders(clerkUserId),
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

/** CSV com os mesmos filtros da lista (sem paginação). */
export async function downloadAdminConsultasExport(clerkUserId: string, params: Omit<AdminConsultaListParams, 'limit' | 'offset'>) {
  const qs = buildListQueryString(params);
  const path = qs ? `admin/consultas/export?${qs}` : 'admin/consultas/export';
  const url = resolveApiUrl(path);
  const res = await fetch(url, {
    headers: clerkHeaders(clerkUserId),
  });
  if (!res.ok) {
    let msg = res.statusText || 'Erro ao exportar.';
    try {
      const body = await res.json();
      if (body && typeof body === 'object' && 'message' in body) {
        msg = String((body as { message: unknown }).message);
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `climaagro-consultas-${Date.now()}.csv`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
