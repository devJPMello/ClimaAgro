export type ReportExportStatus = 'registrado' | 'processando' | 'concluido' | 'falha';

export interface ReportExportItemDto {
  id: string;
  tipo: string;
  local: string;
  periodo: string;
  formato: string;
  status: ReportExportStatus;
  data: string;
  foiGeradoComIA?: boolean;
}

export interface ReportExportListDto {
  items: ReportExportItemDto[];
}

export interface ReportExportCreateBody {
  tipo: string;
  local: string;
  periodo: string;
  formato: string;
  status?: ReportExportStatus;
  foiGeradoComIA?: boolean;
}
