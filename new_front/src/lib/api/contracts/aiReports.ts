export interface ReportHistoryItemDto {
  tipo: string;
  local: string;
  periodo: string;
  formato: string;
  status: string;
  data: string;
}

export interface AiReportGenerationRequestDto {
  localidade: string;
  tipoRelatorio: string;
  periodoInicio: string;
  periodoFim: string;
  formato: string;
  instrucoesUsuario?: string;
  historicoRelatorios: ReportHistoryItemDto[];
}

export interface AiReportGenerationResponseDto {
  summary: string;
  highlights: string[];
}
