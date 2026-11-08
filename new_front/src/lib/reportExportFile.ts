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

const BRAND: [number, number, number] = [22, 101, 52];
const BRAND_LIGHT: [number, number, number] = [220, 252, 231];
const TEXT_MUTED: [number, number, number] = [82, 82, 91];
const BORDER: [number, number, number] = [228, 228, 231];

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase();
}

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

/** Quebra de página se não couber `needPt` pontos abaixo de y. */
function ensureSpace(doc: jsPDF, y: number, margin: number, needPt: number, footerReserve: number): number {
  const h = pageBottom(doc);
  if (y + needPt > h - footerReserve) {
    doc.addPage();
    drawContinuationHeader(doc, margin);
    return margin + 36;
  }
  return y;
}

function drawContinuationHeader(doc: jsPDF, margin: number): void {
  doc.setFillColor(...BRAND_LIGHT);
  doc.rect(0, 0, pageWidth(doc), 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('ClimaAgro · continuação', margin, 18);
  doc.setTextColor(0, 0, 0);
}

function drawCoverBand(doc: jsPDF, margin: number, maxW: number, tituloRelatorio: string): number {
  const w = pageWidth(doc);
  const bandH = 108;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, bandH, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ClimaAgro', margin, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(tituloRelatorio, maxW);
  let ty = 64;
  titleLines.forEach((line: string) => {
    doc.text(line, margin, ty);
    ty += 24;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 252, 231);
  doc.text('Relatório gerado automaticamente a partir das APIs da plataforma.', margin, bandH - 18);

  doc.setTextColor(0, 0, 0);
  return bandH + margin;
}

function drawMetaCard(
  doc: jsPDF,
  y: number,
  margin: number,
  maxW: number,
  rows: { label: string; value: string }[],
  footerReserve: number
): number {
  const pad = 14;
  const labelColW = 88;
  const valueMaxW = maxW - pad * 2 - labelColW - 8;
  doc.setFontSize(10);

  let innerH = 0;
  const rowLayouts: { label: string; valueLines: string[]; h: number }[] = [];
  for (const row of rows) {
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(row.value, valueMaxW);
    const h = Math.max(22, 12 + (valueLines.length - 1) * 12 + 10);
    rowLayouts.push({ label: row.label, valueLines, h });
    innerH += h;
  }
  const cardH = pad * 2 + innerH;

  y = ensureSpace(doc, y, margin, cardH + 8, footerReserve);

  doc.setDrawColor(...BORDER);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, maxW, cardH, 4, 4, 'FD');

  let cy = y + pad + 12;
  for (const rl of rowLayouts) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(rl.label, margin + pad, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    let vy = cy;
    rl.valueLines.forEach((ln) => {
      doc.text(ln, margin + pad + labelColW, vy);
      vy += 12;
    });
    cy += rl.h;
  }
  doc.setTextColor(0, 0, 0);
  return y + cardH + 20;
}

/** Divide o texto da API em secções `=== Título ===`. */
function splitDadosSections(text: string): { heading: string; body: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const re = /===\s*([^=\n]+?)\s*===\s*/g;
  const hits: { index: number; end: number; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    hits.push({ index: m.index, end: m.index + m[0].length, title: m[1].trim() });
  }
  if (hits.length === 0) {
    return [{ heading: 'Dados da API', body: trimmed }];
  }

  const out: { heading: string; body: string }[] = [];
  if (hits[0].index > 0) {
    const pre = trimmed.slice(0, hits[0].index).trim();
    if (pre) out.push({ heading: 'Visão geral', body: pre });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const bodyStart = hits[i].end;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : trimmed.length;
    out.push({ heading: hits[i].title, body: trimmed.slice(bodyStart, bodyEnd).trim() });
  }
  return out;
}

function isLikelyTableLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return false;
  if (!t.includes('|')) return false;
  if (/^[─\-_=]+$/.test(t.replace(/\|/g, ''))) return false;
  const cells = splitTableCells(line);
  if (cells.length < 2) return false;
  if (cells.some((c) => c.length > 200)) return false;
  return true;
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
}

function drawSectionTitle(doc: jsPDF, y: number, margin: number, title: string, footerReserve: number): number {
  y = ensureSpace(doc, y, margin, 36, footerReserve);
  doc.setFillColor(...BRAND);
  doc.rect(margin, y, 3, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  const lines = doc.splitTextToSize(title, pageWidth(doc) - margin * 2 - 16);
  doc.text(lines, margin + 12, y + 12);
  doc.setTextColor(0, 0, 0);
  return y + Math.max(22, lines.length * 14) + 10;
}

function drawTableBlock(
  doc: jsPDF,
  y: number,
  margin: number,
  maxW: number,
  tableLines: string[],
  footerReserve: number
): number {
  if (tableLines.length === 0) return y;

  const rows = tableLines.map(splitTableCells);
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const colW = maxW / cols;
  const baseRowH = 16;
  const padX = 6;

  y = ensureSpace(doc, y, margin, 28, footerReserve);

  doc.setDrawColor(...BORDER);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r];
    let maxLinesInRow = 1;
    const cellTextLines: string[][] = [];
    for (let c = 0; c < cols; c += 1) {
      const raw = cells[c] ?? '';
      const wrapped = doc.splitTextToSize(raw, colW - padX * 2);
      cellTextLines.push(wrapped);
      maxLinesInRow = Math.max(maxLinesInRow, wrapped.length);
    }
    const rowH = baseRowH + (maxLinesInRow - 1) * 11;

    y = ensureSpace(doc, y, margin, rowH + 4, footerReserve);

    let x = margin;
    for (let c = 0; c < cols; c += 1) {
      const fill = r === 0 ? BRAND_LIGHT : [255, 255, 255] as [number, number, number];
      doc.setFillColor(...fill);
      doc.rect(x, y, colW, rowH, 'FD');
      doc.setDrawColor(...BORDER);
      doc.rect(x, y, colW, rowH, 'S');
      doc.setFont('helvetica', r === 0 ? 'bold' : 'normal');
      doc.setFontSize(r === 0 ? 8 : 8.5);
      if (r === 0) doc.setTextColor(...BRAND);
      else doc.setTextColor(40, 40, 42);
      const lines = cellTextLines[c] || [''];
      let ly = y + 12;
      lines.slice(0, 6).forEach((ln) => {
        doc.text(ln, x + padX, ly);
        ly += 11;
      });
      x += colW;
    }
    doc.setTextColor(0, 0, 0);
    y += rowH;
  }
  return y + 12;
}

function drawProseBlock(
  doc: jsPDF,
  y: number,
  margin: number,
  maxW: number,
  text: string,
  footerReserve: number
): number {
  const paragraphs = text.split(/\n\n+/);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(35, 35, 40);

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const lines = doc.splitTextToSize(trimmed, maxW);
    for (const line of lines) {
      y = ensureSpace(doc, y, margin, 16, footerReserve);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 6;
  }
  doc.setTextColor(0, 0, 0);
  return y;
}

/** Corpo de secção: agrupa linhas tabulares e renderiza tabela; resto como texto. */
function renderSectionBody(
  doc: jsPDF,
  y: number,
  margin: number,
  maxW: number,
  body: string,
  footerReserve: number
): number {
  const rawLines = body.split(/\r?\n/);
  let i = 0;
  let proseBuf: string[] = [];

  const flushProse = () => {
    if (proseBuf.length === 0) return;
    const block = proseBuf.join('\n').trim();
    proseBuf = [];
    if (block) y = drawProseBlock(doc, y, margin, maxW, block, footerReserve);
  };

  while (i < rawLines.length) {
    const line = rawLines[i];
    if (isLikelyTableLine(line)) {
      const table: string[] = [];
      while (i < rawLines.length && isLikelyTableLine(rawLines[i])) {
        table.push(rawLines[i]);
        i += 1;
      }
      if (table.length >= 2) {
        flushProse();
        y = drawTableBlock(doc, y, margin, maxW, table, footerReserve);
      } else {
        proseBuf.push(...table);
      }
    } else {
      proseBuf.push(line);
      i += 1;
    }
  }
  flushProse();
  return y;
}

function drawFooters(doc: jsPDF, margin: number): void {
  const totalPages = doc.getNumberOfPages();
  const ts = new Date().toLocaleString('pt-BR');
  const w = pageWidth(doc);
  const h = pageBottom(doc);
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.line(margin, h - 40, w - margin, h - 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Gerado em ${ts}  ·  Página ${p} de ${totalPages}`, margin, h - 24);
    doc.text('ClimaAgro — dados conforme consulta às APIs no momento da exportação.', margin, h - 12);
    doc.setTextColor(0, 0, 0);
  }
}

/** Gera PDF A4 com capa, metadados, secções e tabelas quando possível. */
export function downloadReportPdf(payload: ReportFilePayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const maxW = pageWidth(doc) - margin * 2;
  const footerReserve = 52;

  doc.setProperties({
    title: payload.titulo,
    subject: 'Relatório ClimaAgro',
    author: 'ClimaAgro',
    keywords: 'clima, agricultura, relatório',
  });

  let y = drawCoverBand(doc, margin, maxW, payload.titulo);

  y = drawMetaCard(doc, y, margin, maxW, [
    { label: 'Local', value: payload.local },
    { label: 'Período', value: payload.periodo },
    { label: 'Formato', value: String(payload.formato).toUpperCase() },
  ], footerReserve);

  const ia = (payload.corpoTexto || '').trim();
  if (ia) {
    y = drawSectionTitle(doc, y, margin, 'Resumo e notas', footerReserve);
    y = drawProseBlock(doc, y, margin, maxW, ia, footerReserve);
  }

  const dados = (payload.dadosIntegrados || '').trim();
  if (dados) {
    const sections = splitDadosSections(dados);
    for (const sec of sections) {
      y = drawSectionTitle(doc, y, margin, sec.heading, footerReserve);
      y = renderSectionBody(doc, y, margin, maxW, sec.body, footerReserve);
    }
  }

  if (!ia && !dados) {
    y = drawSectionTitle(doc, y, margin, 'Sem dados nesta exportação', footerReserve);
    y = drawProseBlock(
      doc,
      y,
      margin,
      maxW,
      'Não há texto de resumo nem bloco retornado pela API. Verifique o intervalo de datas, a UF selecionada e se o back-end possui dados sincronizados.',
      footerReserve
    );
  }

  drawFooters(doc, margin);

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
    rows.splice(
      1,
      0,
      ['Nota', 'Exportação em CSV (separador ;), UTF-8 — use "Abrir" no Excel ou importe como texto delimitado.']
    );
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
  downloadReportCsv({ ...payload, formato: 'xlsx' }, 'xlsx');
}
