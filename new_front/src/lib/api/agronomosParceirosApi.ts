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

export async function listarAgronomosParceiros() {
  return httpClient.get<{ agronomos: AgronomoParceiroApi[] }>('agronomos-parceiros', {
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
