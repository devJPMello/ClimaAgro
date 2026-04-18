import { httpClient } from './httpClient';
import type { ReportExportCreateBody, ReportExportItemDto, ReportExportListDto } from './contracts/reportExports';

const STORAGE_KEY = 'climaagro_export_client_id';

function getOrCreateExportClientId(): string {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    throw new Error('Não foi possível obter ID do cliente para histórico de exportações.');
  }
}

function clientHeaders(): Record<string, string> {
  return { 'X-Export-Client-Id': getOrCreateExportClientId() };
}

export async function listReportExports(): Promise<ReportExportListDto> {
  return httpClient.get<ReportExportListDto>('reports/exports', { headers: clientHeaders() });
}

export async function createReportExport(body: ReportExportCreateBody): Promise<{ item: ReportExportItemDto }> {
  return httpClient.post<{ item: ReportExportItemDto }>('reports/exports', body, { headers: clientHeaders() });
}
