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
}) {
  // A API pública só devolve parceiros ativos.
  const q = new URLSearchParams();
  if (params?.especialidade?.trim()) q.set('especialidade', params.especialidade.trim());
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return httpClient.get<{ agronomos: AgronomoParceiroApi[] }>(`agronomos-parceiros${suffix}`, {
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

export type StatusMeuCadastro = 'nao_cadastrado' | 'em_analise' | 'aprovado';

export interface MeuCadastroAgronomo {
  status: StatusMeuCadastro;
  cadastro: {
    nome: string;
    email: string;
    whatsapp: string | null;
    whatsappVerificadoEm: string | null;
    municipio: string | null;
    uf: string | null;
    crea: string | null;
    especialidade: string | null;
  } | null;
}

/** Situação do cadastro de agrônomo de quem está logado. */
export async function obterMeuCadastroAgronomo() {
  return httpClient.get<MeuCadastroAgronomo>('agronomos-parceiros/meu-cadastro', {
    cacheTtlMs: 0,
    forceRefresh: true,
  });
}

/** Envia um código de 6 dígitos para o WhatsApp informado. */
export async function enviarCodigoWhatsapp(whatsapp: string) {
  return httpClient.post<{ success: boolean; message: string }>('agronomos-parceiros/whatsapp/codigo', { whatsapp });
}

/** Confere o código recebido no WhatsApp. */
export async function confirmarCodigoWhatsapp(codigo: string) {
  return httpClient.post<{ success: boolean; whatsapp: string }>('agronomos-parceiros/whatsapp/confirmar', { codigo });
}

/** Cria ou atualiza o cadastro de agrônomo de quem está logado (o WhatsApp precisa estar confirmado). */
export async function cadastrarAgronomoParceiro(payload: {
  nome: string;
  email?: string;
  /** 11 dígitos (com ou sem máscara; o back normaliza). */
  cpf: string;
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
