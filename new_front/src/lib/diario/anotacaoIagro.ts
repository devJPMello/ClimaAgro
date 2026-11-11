import type { TipoRegistro } from '../api/diarioApi';

/** Anotação que o IAgro propõe a partir do pedido do usuário; só vira registro depois do Confirmar. */
export type AnotacaoProposta = {
  data: string;
  tipo: TipoRegistro;
  cultura: string;
  uf: string;
  municipio: string;
  observacao: string;
};

const CHAVE = 'climaagro.iagro.diarioDecididos';

export type Decisao = 'salvo' | 'cancelado';

/** Identifica a proposta pelo conteúdo, para o cartão não voltar depois de confirmado, mesmo após recarregar a conversa. */
export function impressaoDaProposta(a: Pick<AnotacaoProposta, 'data' | 'tipo' | 'observacao'>): string {
  return `${a.data}|${a.tipo}|${a.observacao.trim().toLowerCase()}`;
}

export function lerDecisoes(): Record<string, Decisao> {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const dados = bruto ? JSON.parse(bruto) : {};
    return dados && typeof dados === 'object' ? (dados as Record<string, Decisao>) : {};
  } catch {
    return {};
  }
}

export function gravarDecisao(a: Pick<AnotacaoProposta, 'data' | 'tipo' | 'observacao'>, decisao: Decisao): void {
  try {
    const atual = lerDecisoes();
    atual[impressaoDaProposta(a)] = decisao;
    const chaves = Object.keys(atual);
    // guarda só as 200 mais recentes para o armazenamento local não crescer sem limite
    for (const k of chaves.slice(0, Math.max(0, chaves.length - 200))) delete atual[k];
    window.localStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    /* sem armazenamento local: o cartão apenas volta a aparecer */
  }
}
