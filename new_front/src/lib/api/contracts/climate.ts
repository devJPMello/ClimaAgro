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

export type ClimateSeriesVariable =
  | 'temperatura_media'
  | 'temperatura_maxima'
  | 'temperatura_minima'
  | 'precipitacao'
  | 'umidade'
  | 'vento'
  | 'pressao';

export interface ClimateSeriesResponseDto {
  success: boolean;
  metadata: {
    uf: string;
    /** Presente quando `uf` é ALL: true = série por UF no país; omitido/false = média nacional por dia. */
    perUf?: boolean;
    periodo: { start: string; end: string };
    variavel: ClimateSeriesVariable;
    fonte: string;
    unidade: string;
  };
  serieTemporal: Array<{ date: string; uf: string; value: number | null }>;
  estatisticas: { media: number | null; min: number | null; max: number | null };
  pagination: { limit: number; offset: number; returned: number };
}
