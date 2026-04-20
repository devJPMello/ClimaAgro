import { jsPDF } from 'jspdf';

export type ReportExportFileFormat = 'pdf' | 'csv' | 'xlsx';

export interface ReportFilePayload {
  titulo: string;
  local: string;
  periodo: string;
  formato: ReportExportFileFormat;
  /** Texto opcional (ex.: resumo gerado por IA) */
  corpoTexto?: string;
  /** Bloco com estatísticas e amostras vindas da API (clima / produtividade). */
  dadosIntegrados?: string;
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase();
}

/** Gera PDF A4 com metadados e texto opcional; faz download no browser. */
export function downloadReportPdf(payload: ReportFilePayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ClimaAgro', margin, y);
  y += 28;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(payload.titulo, maxW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 16 + 8;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const meta = [
    `Local: ${payload.local}`,
    `Período: ${payload.periodo}`,
    `Formato: ${String(payload.formato).toUpperCase()}`,
  ];
  meta.forEach((line) => {
    doc.text(line, margin, y);
    y += 14;
  });
  y += 12;

  doc.setTextColor(0, 0, 0);

  const writeBlock = (heading: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(heading, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const paragraphs = t.split(/\n\n+/);
    for (const p of paragraphs) {
      const lines = doc.splitTextToSize(p.trim(), maxW);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - margin - 24) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 12;
      }
      y += 6;
    }
    y += 8;
  };

  const ia = (payload.corpoTexto || '').trim();
  if (ia) {
    writeBlock('Resumo e notas (IA / utilizador)', ia);
  }

  const dados = (payload.dadosIntegrados || '').trim();
  if (dados) {
    writeBlock('Dados climáticos e agrícolas (API ClimaAgro)', dados);
  }

  if (!ia && !dados) {
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    const hint = doc.splitTextToSize(
      'Sem texto de IA nem dados da API neste relatório. Verifique o intervalo de datas e se o back-end tem dados sincronizados.',
      maxW
    );
    hint.forEach((line) => {
      if (y > doc.internal.pageSize.getHeight() - margin - 24) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 12;
    });
  }

  const totalPages = doc.getNumberOfPages();
  const ts = new Date().toLocaleString('pt-BR');
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado em ${ts} · ${p}/${totalPages}`, margin, doc.internal.pageSize.getHeight() - 28);
  }

  const name = `climaagro-relatorio-${slug(payload.local)}-${Date.now()}.pdf`;
  doc.save(name);
}

function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadReportCsv(payload: ReportFilePayload, fileExt: 'csv' | 'xlsx' = 'csv'): void {
  const rows = [
    ['Campo', 'Valor'],
    ['Título', payload.titulo],
    ['Local', payload.local],
    ['Período', payload.periodo],
    ['Formato', payload.formato],
    ['Resumo_IA', (payload.corpoTexto || '').replace(/\r?\n/g, ' ')],
    ['Dados_API', (payload.dadosIntegrados || '').replace(/\r?\n/g, ' | ')],
    ['Gerado em', new Date().toISOString()],
  ];
  if (fileExt === 'xlsx') {
    rows.splice(1, 0, ['Nota', 'Arquivo em CSV separado por ponto e vírgula; abra no Excel ou LibreOffice.']);
  }
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(';')).join('\r\n');
  const ext = fileExt === 'xlsx' ? 'csv' : 'csv';
  downloadTextFile(`climaagro-relatorio-${slug(payload.local)}-${Date.now()}.${ext}`, csv, 'text/csv');
}

/** CSV com separador compatível com Excel (pt-BR). */
export function downloadReportFile(payload: ReportFilePayload): void {
  const f = payload.formato;
  if (f === 'pdf') {
    downloadReportPdf(payload);
    return;
  }
  if (f === 'csv') {
    downloadReportCsv(payload, 'csv');
    return;
  }
  // Planilha: CSV com separador ; (abre no Excel em pt-BR).
  downloadReportCsv({ ...payload, formato: 'xlsx' }, 'xlsx');
}
