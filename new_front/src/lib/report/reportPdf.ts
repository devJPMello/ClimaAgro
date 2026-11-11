import { jsPDF } from 'jspdf';
import { drawBarLineChart, type RGB } from './pdfCharts';
import {
  buildInsights,
  buildKpis,
  climateTotals,
  formatNumber,
  mainCrop,
  monthNameOf,
  periodLabel,
  productivityByCrop,
  productivityByYear,
  shortMonthLabel,
  type ReportModel,
} from './reportModel';

const BRAND: RGB = [22, 101, 52];
const BRAND_LIGHT: RGB = [220, 252, 231];
const TEXT_MUTED: RGB = [82, 82, 91];
const BORDER: RGB = [228, 228, 231];
const ZEBRA: RGB = [247, 248, 250];
const RAIN: RGB = [55, 138, 221];
const TEMP: RGB = [216, 90, 48];
const PROD: RGB = [59, 109, 17];

const MARGIN = 48;
const FOOTER_RESERVE = 52;

export type ReportPdfMeta = { titulo: string; local: string };

function pageW(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function pageH(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function continuationHeader(doc: jsPDF): void {
  doc.setFillColor(...BRAND_LIGHT);
  doc.rect(0, 0, pageW(doc), 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('ClimaAgro · continuação', MARGIN, 18);
  doc.setTextColor(0, 0, 0);
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > pageH(doc) - FOOTER_RESERVE) {
    doc.addPage();
    continuationHeader(doc);
    return MARGIN + 30;
  }
  return y;
}

function cover(doc: jsPDF, meta: ReportPdfMeta, model: ReportModel, generatedAt: Date): number {
  const w = pageW(doc);
  const bandH = 104;
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, bandH, 'F');
  doc.setTextColor(220, 252, 231);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`ClimaAgro · ${meta.titulo}`, MARGIN, 38);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(doc.splitTextToSize(model.stateLabel, w - MARGIN * 2)[0] ?? model.stateLabel, MARGIN, 68);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(220, 252, 231);
  doc.text(`Período: ${periodLabel(model)}  ·  gerado em ${generatedAt.toLocaleDateString('pt-BR')}`, MARGIN, 90);
  doc.setTextColor(0, 0, 0);
  return bandH + 22;
}

function kpiRow(doc: jsPDF, y: number, model: ReportModel): number {
  const kpis = buildKpis(model);
  if (!kpis.length) return y;
  const gap = 8;
  const maxW = pageW(doc) - MARGIN * 2;
  const cardW = (maxW - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 62;
  y = ensureSpace(doc, y, cardH + 14);
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setFillColor(...ZEBRA);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, cardW, cardH, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(doc.splitTextToSize(k.label, cardW - 14)[0], x + 8, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 30, 30);
    doc.text(doc.splitTextToSize(k.value, cardW - 14)[0], x + 8, y + 36);
    if (k.hint) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND);
      doc.text(doc.splitTextToSize(k.hint, cardW - 14)[0], x + 8, y + 52);
    }
  });
  doc.setTextColor(0, 0, 0);
  return y + cardH + 18;
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, 40);
  doc.setFillColor(...BRAND);
  doc.rect(MARGIN, y, 3, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text(title, MARGIN + 11, y + 12);
  doc.setTextColor(0, 0, 0);
  return y + 26;
}

function bullets(doc: jsPDF, y: number, items: string[]): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(35, 35, 40);
  const maxW = pageW(doc) - MARGIN * 2 - 14;
  for (const item of items) {
    const lines = doc.splitTextToSize(item, maxW) as string[];
    y = ensureSpace(doc, y, lines.length * 13 + 4);
    doc.setFillColor(...BRAND);
    doc.circle(MARGIN + 3, y - 3, 1.5, 'F');
    for (const line of lines) {
      doc.text(line, MARGIN + 12, y);
      y += 13;
    }
    y += 3;
  }
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

type Column = { header: string; weight: number; align?: 'left' | 'right' };

function table(doc: jsPDF, y: number, columns: Column[], rows: string[][]): number {
  const maxW = pageW(doc) - MARGIN * 2;
  const totalWeight = columns.reduce((a, c) => a + c.weight, 0);
  const widths = columns.map((c) => (c.weight / totalWeight) * maxW);
  const rowH = 17;

  const header = (yy: number) => {
    doc.setFillColor(...BRAND_LIGHT);
    doc.rect(MARGIN, yy, maxW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND);
    let x = MARGIN;
    columns.forEach((c, i) => {
      doc.text(c.header, c.align === 'right' ? x + widths[i] - 6 : x + 6, yy + 11.5, { align: c.align === 'right' ? 'right' : 'left' });
      x += widths[i];
    });
  };

  y = ensureSpace(doc, y, rowH * 3);
  header(y);
  y += rowH;
  rows.forEach((row, r) => {
    if (y + rowH > pageH(doc) - FOOTER_RESERVE) {
      doc.addPage();
      continuationHeader(doc);
      y = MARGIN + 30;
      header(y);
      y += rowH;
    }
    if (r % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, y, maxW, rowH, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 42);
    let x = MARGIN;
    row.forEach((cell, i) => {
      const text = String(doc.splitTextToSize(cell, widths[i] - 12)[0] ?? '');
      doc.text(text, columns[i].align === 'right' ? x + widths[i] - 6 : x + 6, y + 11.5, {
        align: columns[i].align === 'right' ? 'right' : 'left',
      });
      x += widths[i];
    });
    y += rowH;
  });
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN, y, MARGIN + maxW, y);
  doc.setTextColor(0, 0, 0);
  return y + 16;
}

function climateChart(doc: jsPDF, y: number, model: ReportModel): number {
  const months = (model.climate ?? []).filter((m) => m.days > 0);
  if (!months.length) return y;
  y = sectionTitle(doc, y, 'Chuva e temperatura por mês');
  const h = 150;
  y = ensureSpace(doc, y, h + 8);
  drawBarLineChart(doc, MARGIN, y, pageW(doc) - MARGIN * 2, h, {
    labels: months.map((m) => shortMonthLabel(m.ym)),
    bars: months.map((m) => m.rainfall),
    line: months.map((m) => m.temperature),
    barColor: RAIN,
    lineColor: TEMP,
    barUnit: 'Chuva (mm)',
    lineUnit: 'Temperatura (°C)',
  });
  return y + h + 14;
}

function productivityChart(doc: jsPDF, y: number, model: ReportModel): number {
  const crop = mainCrop(model.productivity);
  const years = productivityByYear(model.productivity, crop ?? undefined);
  if (!years.length) return y;
  y = sectionTitle(doc, y, `Produtividade por ano${crop ? ` — ${crop}` : ''} (t/ha)`);
  const h = 130;
  y = ensureSpace(doc, y, h + 8);
  drawBarLineChart(doc, MARGIN, y, pageW(doc) - MARGIN * 2, h, {
    labels: years.map((a) => String(a.year)),
    bars: years.map((a) => a.average),
    barColor: PROD,
    barUnit: 'Produtividade média (t/ha)',
    barDigits: 1,
    valueLabels: true,
  });
  return y + h + 14;
}

function seasonChart(doc: jsPDF, y: number, model: ReportModel): number {
  const rows = model.seasonRows ?? [];
  if (!rows.length) return y;
  y = sectionTitle(doc, y, `Chuva e produtividade por mês — safra ${model.season ?? ''}`.trim());
  const h = 150;
  y = ensureSpace(doc, y, h + 8);
  drawBarLineChart(doc, MARGIN, y, pageW(doc) - MARGIN * 2, h, {
    labels: rows.map((r) => (r.month ? shortMonthLabel(r.month) : r.label)),
    bars: rows.map((r) => r.rainfall),
    line: rows.map((r) => r.productivity),
    barColor: RAIN,
    lineColor: PROD,
    barUnit: 'Chuva (mm)',
    lineUnit: 'Produtividade (t/ha)',
  });
  return y + h + 14;
}

function climateTable(doc: jsPDF, y: number, model: ReportModel): number {
  const months = model.climate ?? [];
  if (!months.length) return y;
  y = sectionTitle(doc, y, 'Resumo mensal do clima');
  return table(
    doc,
    y,
    [
      { header: 'Mês', weight: 3 },
      { header: 'Chuva (mm)', weight: 2, align: 'right' },
      { header: 'Temp. (°C)', weight: 2, align: 'right' },
      { header: 'Umidade (%)', weight: 2, align: 'right' },
      { header: 'Vento (km/h)', weight: 2, align: 'right' },
      { header: 'Dias', weight: 1, align: 'right' },
    ],
    months.map((m) => [
      monthNameOf(m.ym).replace(/^./, (c) => c.toUpperCase()),
      formatNumber(m.rainfall, 1),
      formatNumber(m.temperature, 1),
      formatNumber(m.humidity, 0),
      formatNumber(m.wind, 1),
      String(m.days),
    ])
  );
}

function productivityTables(doc: jsPDF, y: number, model: ReportModel): number {
  if (!model.productivity.length) return y;
  const crops = productivityByCrop(model.productivity);
  y = sectionTitle(doc, y, 'Produtividade por cultura');
  y = table(
    doc,
    y,
    [
      { header: 'Cultura', weight: 4 },
      { header: 'Registros', weight: 1.5, align: 'right' },
      { header: 'Média (t/ha)', weight: 2, align: 'right' },
    ],
    crops.map((c) => [c.crop, String(c.records), formatNumber(c.average, 2)])
  );
  const sorted = [...model.productivity]
    .filter((r) => r.value != null)
    .sort((a, b) => a.crop.localeCompare(b.crop, 'pt-BR') || (a.year ?? 0) - (b.year ?? 0))
    .slice(0, 60);
  if (!sorted.length) return y;
  y = sectionTitle(doc, y, `Detalhe por cultura e ano${model.productivity.length > 60 ? ' (primeiros 60 registros)' : ''}`);
  return table(
    doc,
    y,
    [
      { header: 'Cultura', weight: 3 },
      { header: 'Ano', weight: 1, align: 'right' },
      { header: 'Local', weight: 3 },
      { header: 'Produtividade (t/ha)', weight: 2, align: 'right' },
    ],
    sorted.map((r) => [r.crop, r.year != null ? String(r.year) : '—', r.place, formatNumber(r.value, 2)])
  );
}

function seasonTable(doc: jsPDF, y: number, model: ReportModel): number {
  const rows = model.seasonRows ?? [];
  if (!rows.length) return y;
  y = sectionTitle(doc, y, 'Tabela mensal da safra');
  return table(
    doc,
    y,
    [
      { header: 'Mês', weight: 2 },
      { header: 'Chuva (mm)', weight: 2, align: 'right' },
      { header: 'Temp. (°C)', weight: 2, align: 'right' },
      { header: 'Umidade (%)', weight: 2, align: 'right' },
      { header: 'Prod. (t/ha)', weight: 2, align: 'right' },
    ],
    rows.map((r) => [r.label, formatNumber(r.rainfall, 1), formatNumber(r.temperature, 1), formatNumber(r.humidity, 0), formatNumber(r.productivity, 2)])
  );
}

function sourcesNote(doc: jsPDF, y: number, model: ReportModel): number {
  y = sectionTitle(doc, y, 'Fontes e limites');
  const items: string[] = [];
  if (model.kind !== 'produtividade') items.push('Clima: Open-Meteo, CPTEC/INPE e INMET, agregado por estado e por mês.');
  if (model.kind !== 'clima') items.push('Produtividade: IBGE/SIDRA (LSPA), por estado, cultura e ano.');
  items.push('Os valores são médias do estado, não medições da sua propriedade.');
  items.push('Este relatório é descritivo e não substitui a orientação de um agrônomo habilitado.');
  return bullets(doc, y, items);
}

function footers(doc: jsPDF, generatedAt: Date): void {
  const total = doc.getNumberOfPages();
  const w = pageW(doc);
  const h = pageH(doc);
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, h - 40, w - MARGIN, h - 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`ClimaAgro · gerado em ${generatedAt.toLocaleString('pt-BR')}`, MARGIN, h - 24);
    doc.text(`Página ${p} de ${total}`, w - MARGIN, h - 24, { align: 'right' });
    doc.text('Dados conforme consulta às APIs no momento da exportação.', MARGIN, h - 12);
    doc.setTextColor(0, 0, 0);
  }
}

/** Monta o PDF A4 do relatório (destaques, gráficos, leitura dos dados, tabelas e fontes) a partir do modelo. */
export function createModelReportPdf(meta: ReportPdfMeta, model: ReportModel, generatedAt = new Date()): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({ title: `${meta.titulo} — ${model.stateLabel}`, subject: 'Relatório ClimaAgro', author: 'ClimaAgro', keywords: 'clima, agricultura, relatório' });

  let y = cover(doc, meta, model, generatedAt);
  const t = climateTotals(model.climate);
  const hasClimate = t.monthsWithData > 0;
  const hasProductivity = model.productivity.length > 0;
  const hasSeason = (model.seasonRows?.length ?? 0) > 0;

  if (!hasClimate && !hasProductivity && !hasSeason) {
    y = sectionTitle(doc, y, 'Sem dados nesta exportação');
    y = bullets(doc, y, ['Não há dados para o estado e o período escolhidos. Confira o intervalo de anos e se o servidor tem dados sincronizados.']);
    y = sourcesNote(doc, y, model);
    footers(doc, generatedAt);
    return doc;
  }

  y = kpiRow(doc, y, model);

  if (hasSeason) {
    y = seasonChart(doc, y, model);
  } else {
    if (hasClimate && model.kind !== 'produtividade') y = climateChart(doc, y, model);
    if (hasProductivity && model.kind !== 'clima') y = productivityChart(doc, y, model);
  }

  const insights = buildInsights(model);
  if (insights.length) {
    y = sectionTitle(doc, y, 'Leitura dos dados');
    y = bullets(doc, y, insights);
  }

  if (hasSeason) y = seasonTable(doc, y, model);
  if (hasClimate && model.kind !== 'produtividade') y = climateTable(doc, y, model);
  if (hasProductivity && model.kind !== 'clima') y = productivityTables(doc, y, model);

  sourcesNote(doc, y, model);
  footers(doc, generatedAt);
  return doc;
}
