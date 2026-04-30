/** Contrato alinhado ao que o backend deve expor (ex.: GET /alerts ou /climate/alerts). */

export type ClimateAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ClimateAlertFonte = 'derivado' | 'inmet' | 'cptec';

export type ClimateAlertTendencia = 'crescente' | 'decrescente' | 'estavel';

export interface ClimateAlertDto {
  id: string;
  tipo: string;
  local: string;
  valorAtual: string;
  limiar: string;
  recomendacao: string;
  impactoEstimado: string;
  severidade: ClimateAlertSeverity;
  data: string;
  /** Origem do alerta (oficial INMET via JSON configurado, CPTEC/siglas, ou regras locais). */
  fonte?: ClimateAlertFonte;
  tendencia?: ClimateAlertTendencia;
}

/** Contagens por origem lógica (backend GET /climate/alerts). */
export interface ClimateAlertLayerSummaryDto {
  oficialExplicito: number;
  cptecProduto: number;
  derivadoClimateData: number;
}

export interface ClimateAlertListDto {
  items: ClimateAlertDto[];
  updatedAt: string;
  resumoCamadas?: ClimateAlertLayerSummaryDto;
}
