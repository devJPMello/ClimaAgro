import { buildReportFile } from './reportExportFile';
import { emptyReportModel, type ReportModel } from './report/reportModel';

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

function lerBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

function modelo(): ReportModel {
  const m = emptyReportModel('comparativo', 'Mato Grosso (MT)', '2025-01-01', '2026-12-31');
  const chuva = [200, 180, 160, 80, 20, 5, 3, 8, 40, 110, 170, 190];
  m.climate = [2025, 2026].flatMap((ano) =>
    chuva.map((r, i) => ({
      ym: `${ano}-${String(i + 1).padStart(2, '0')}`,
      label: '',
      days: 30,
      temperature: 26 + i * 0.1,
      rainfall: r,
      humidity: 60,
      wind: 9,
    }))
  );
  m.productivity = [
    { year: 2025, crop: 'Soja', value: 3.5, place: 'Mato Grosso' },
    { year: 2026, crop: 'Soja', value: 3.9, place: 'Mato Grosso' },
    { year: 2026, crop: 'Milho', value: 6.1, place: 'Mato Grosso' },
  ];
  return m;
}

describe('arquivos do relatório (sem modelo: layout antigo, só texto)', () => {
  test('CSV antigo: conteúdo com separador ; e nome .csv', async () => {
    const { blob, filename } = await buildReportFile({ ...base, formato: 'csv' });
    expect(filename).toMatch(/^climaagro-relatorio-.*\.csv$/);
    expect(await lerTexto(blob)).toContain('"Local";"Tocantins"');
  });

  test('PDF antigo continua saindo como PDF de verdade', async () => {
    const { blob, filename } = await buildReportFile({ ...base, formato: 'pdf' });
    expect(filename).toMatch(/\.pdf$/);
    expect(await lerTexto(blob.slice(0, 5))).toBe('%PDF-');
  });
});

describe('arquivos do relatório (com modelo estruturado)', () => {
  test('CSV: uma linha por mês e variável, com vírgula decimal', async () => {
    const { blob, filename } = await buildReportFile({ ...base, formato: 'csv', model: modelo() });
    expect(filename.endsWith('.csv')).toBe(true);
    const linhas = (await lerTexto(blob)).replace('﻿', '').split(/\r?\n/);
    expect(linhas[0]).toBe('"secao";"periodo";"cultura";"variavel";"valor";"unidade";"local"');
    expect(linhas).toContain('"Clima";"2025-01";"";"Chuva";"200";"mm";"Mato Grosso (MT)"');
    expect(linhas).toContain('"Clima";"2025-02";"";"Temperatura média";"26,1";"°C";"Mato Grosso (MT)"');
    expect(linhas).toContain('"Produtividade";"2026";"Milho";"Produtividade";"6,1";"t/ha";"Mato Grosso"');
    expect(linhas.length).toBe(1 + 24 * 4 + 3);
  });

  test('Excel: sai um .xlsx de verdade (arquivo zip), com o tipo certo', async () => {
    const { blob, filename } = await buildReportFile({ ...base, formato: 'xlsx', model: modelo() });
    expect(filename).toMatch(/\.xlsx$/);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const bytes = await lerBytes(blob);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });

  test('PDF novo: PDF de verdade, com mais de uma página quando há muitas linhas', async () => {
    const { blob } = await buildReportFile({ ...base, formato: 'pdf', model: modelo() });
    expect(await lerTexto(blob.slice(0, 5))).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(5000);
  });

  test('PDF e Excel sem dados não quebram e avisam que não há dados', async () => {
    const vazio = emptyReportModel('clima', 'Acre (AC)', '2026-01-01', '2026-12-31');
    const pdf = await buildReportFile({ ...base, formato: 'pdf', model: vazio });
    expect(await lerTexto(pdf.blob.slice(0, 5))).toBe('%PDF-');
    const xlsx = await buildReportFile({ ...base, formato: 'xlsx', model: vazio });
    expect((await lerBytes(xlsx.blob)).length).toBeGreaterThan(500);
    const csv = await buildReportFile({ ...base, formato: 'csv', model: vazio });
    expect((await lerTexto(csv.blob)).replace('﻿', '')).toBe('"secao";"periodo";"cultura";"variavel";"valor";"unidade";"local"');
  });
});
