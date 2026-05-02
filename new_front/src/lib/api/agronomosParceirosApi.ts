import { httpClient } from './httpClient';

export type AgronomoParceiroApi = {
  id: string;
  nome: string;
  email?: string;
  whatsapp?: string;
  telefone?: string;
  telefoneFormatado?: string;
  municipio?: string;
  uf?: string;
  crea?: string;
  especialidade?: string;
  avaliacao?: number;
  totalAvaliacoes?: number;
  totalAtendimentos?: number;
  tempoResposta?: string;
  sobre?: string;
  areasAtuacao?: string[];
};

export async function listarAgronomosParceiros(params?: {
  especialidade?: string;
  /** default na API: apenas parceiros ativos */
  ativo?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.especialidade?.trim()) q.set('especialidade', params.especialidade.trim());
  if (params?.ativo !== undefined) q.set('ativo', params.ativo ? 'true' : 'false');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return httpClient.get<{ agronomos: AgronomoParceiroApi[] }>(`agronomos-parceiros${suffix}`, {
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export async function cadastrarAgronomoParceiro(payload: {
  nome: string;
  email: string;
  whatsapp: string;
  telefone?: string;
  municipio?: string;
  uf?: string;
  crea?: string;
  especialidade: string;
  sobre?: string;
}) {
  return httpClient.post<{ success: boolean; message?: string }>('agronomos-parceiros/cadastro', payload);
}
