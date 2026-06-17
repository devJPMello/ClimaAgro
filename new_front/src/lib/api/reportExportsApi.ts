import { httpClient } from './httpClient';
import type { ReportExportCreateBody, ReportExportItemDto, ReportExportListDto } from './contracts/reportExports';
import { STORAGE_KEYS } from '../storage/storageKeys';

function getOrCreateExportClientId(): string {
  try {
    let id = window.localStorage.getItem(STORAGE_KEYS.REPORT_EXPORT_CLIENT_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEYS.REPORT_EXPORT_CLIENT_ID, id);
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
