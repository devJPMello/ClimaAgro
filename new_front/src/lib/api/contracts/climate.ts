/** Contrato alinhado ao que o backend deve expor (ex.: GET /climate/dashboard-summary). */

export type DashboardMetricKey = 'temperature' | 'precipitation' | 'alerts' | 'productivity';

export interface DashboardKpiDto {
  title: string;
  value: string;
  change?: number;
  metric: DashboardMetricKey;
  color: string;
}

export interface DashboardRegionRowDto {
  /** Sigla UF (ex.: SP) — usada para colorir o mapa. */
  uf?: string;
  estado: string;
  temperatura: string;
  precipitacao: string;
  produtividade: string;
  umidade?: string;
  vento?: string;
  /** Valores numéricos para o mapa (quando disponíveis no backend). */
  temperaturaNum?: number | null;
  umidadeNum?: number | null;
  ventoNum?: number | null;
  precipitacaoNum?: number | null;
  produtividadeNum?: number | null;
  alertas: number;
}

export interface DashboardSummaryDto {
  kpis: DashboardKpiDto[];
  regioes: DashboardRegionRowDto[];
}
