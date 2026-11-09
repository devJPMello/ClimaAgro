import { buildReportFile } from './reportExportFile';

const base = {
  titulo: 'Relatório de Clima',
  local: 'Tocantins',
  periodo: 'Anos 2024 — 2025',
  dadosIntegrados: '### Clima\nTemperatura média: 27 °C',
};

function lerTexto(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

describe('buildReportFile (arquivo enviado ao WhatsApp)', () => {
  test('CSV: devolve o conteúdo com separador ; e nome .csv', async () => {
    const { blob, filename } = buildReportFile({ ...base, formato: 'csv' });
    expect(filename).toMatch(/^climaagro-relatorio-.*\.csv$/);
    expect(blob.type).toContain('text/csv');
    const texto = await lerTexto(blob);
    expect(texto).toContain('"Local";"Tocantins"');
  });

  test('Excel: sai como CSV, com a nota explicativa', async () => {
    const { blob, filename } = buildReportFile({ ...base, formato: 'xlsx' });
    expect(filename.endsWith('.csv')).toBe(true);
    expect(await lerTexto(blob)).toContain('Exportação em CSV');
  });

  test('PDF: devolve um PDF de verdade', async () => {
    const { blob, filename } = buildReportFile({ ...base, formato: 'pdf' });
    expect(filename).toMatch(/\.pdf$/);
    expect(blob.size).toBeGreaterThan(1000);
    expect(await lerTexto(blob.slice(0, 5))).toBe('%PDF-');
  });
});
