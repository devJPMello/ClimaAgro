import type { jsPDF } from 'jspdf';

export type RGB = [number, number, number];

const AXIS: RGB = [160, 160, 168];
const GRID: RGB = [228, 228, 231];
const TEXT: RGB = [82, 82, 91];

/** Maior valor "redondo" (1, 2, 2,5, 5 × 10^k) que cobre `max`, para o eixo vertical. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  const f = max / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/** Índices dos rótulos que cabem no eixo horizontal (evita sobrepor texto quando há muitos meses). */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / maxLabels);
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  return out;
}

function fmt(v: number, digits: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export type BarLineChart = {
  labels: string[];
  bars: Array<number | null>;
  line?: Array<number | null>;
  barColor: RGB;
  lineColor?: RGB;
  barUnit: string;
  lineUnit?: string;
  barDigits?: number;
  /** Escreve o valor em cima de cada barra (bom para poucos pontos, como anos). */
  valueLabels?: boolean;
};

/**
 * Gráfico de barras com linha opcional (eixo secundário à direita), desenhado com formas do jsPDF.
 * Devolve a altura total ocupada (inclui os rótulos e a legenda).
 */
export function drawBarLineChart(doc: jsPDF, x: number, y: number, w: number, h: number, c: BarLineChart): number {
  const left = 34;
  const right = c.line ? 30 : 6;
  const top = 8;
  const bottom = 22;
  const plotX = x + left;
  const plotY = y + top;
  const plotW = w - left - right;
  const plotH = h - top - bottom;
  const n = c.labels.length;
  if (n === 0) return h;

  const barVals = c.bars.filter((v): v is number => v != null);
  const barTop = niceMax(Math.max(0, ...barVals));
  const lineVals = (c.line ?? []).filter((v): v is number => v != null);
  const lineMin = lineVals.length ? Math.min(...lineVals) : 0;
  const lineMax = lineVals.length ? Math.max(...lineVals) : 1;
  const lineSpan = lineMax - lineMin || 1;

  doc.setLineWidth(0.4);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  for (let g = 0; g <= 4; g += 1) {
    const gy = plotY + plotH - (plotH * g) / 4;
    doc.setDrawColor(...(g === 0 ? AXIS : GRID));
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setTextColor(...TEXT);
    doc.text(fmt((barTop * g) / 4, c.barDigits ?? 0), plotX - 4, gy + 2.5, { align: 'right' });
    if (c.line && lineVals.length) {
      doc.text(fmt(lineMin + (lineSpan * g) / 4, lineSpan < 8 ? 1 : 0), plotX + plotW + 4, gy + 2.5);
    }
  }

  const slot = plotW / n;
  const barW = Math.max(1.5, Math.min(26, slot * 0.62));
  c.bars.forEach((v, i) => {
    if (v == null || v <= 0) return;
    doc.setFillColor(...c.barColor);
    const bh = (v / barTop) * plotH;
    const bx = plotX + slot * i + (slot - barW) / 2;
    doc.rect(bx, plotY + plotH - bh, barW, bh, 'F');
    if (c.valueLabels) {
      doc.setTextColor(...TEXT);
      doc.setFontSize(7.5);
      doc.text(fmt(v, c.barDigits ?? 0), bx + barW / 2, plotY + plotH - bh - 3, { align: 'center' });
    }
  });

  if (c.line && c.lineColor && lineVals.length) {
    doc.setDrawColor(...c.lineColor);
    doc.setLineWidth(1.2);
    let prev: [number, number] | null = null;
    c.line.forEach((v, i) => {
      if (v == null) {
        prev = null;
        return;
      }
      const px = plotX + slot * i + slot / 2;
      const py = plotY + plotH - ((v - lineMin) / lineSpan) * plotH;
      if (prev) doc.line(prev[0], prev[1], px, py);
      prev = [px, py];
    });
    doc.setLineWidth(0.4);
  }

  doc.setFontSize(7);
  doc.setTextColor(...TEXT);
  for (const i of labelIndexes(n, Math.max(4, Math.floor(plotW / 34)))) {
    doc.text(c.labels[i], plotX + slot * i + slot / 2, plotY + plotH + 10, { align: 'center' });
  }

  const ly = y + h - 3;
  doc.setFillColor(...c.barColor);
  doc.rect(plotX, ly - 5, 7, 5, 'F');
  doc.text(c.barUnit, plotX + 10, ly - 0.5);
  if (c.line && c.lineColor && c.lineUnit) {
    doc.setDrawColor(...c.lineColor);
    doc.setLineWidth(1.4);
    doc.line(plotX + 90, ly - 2.5, plotX + 99, ly - 2.5);
    doc.setLineWidth(0.4);
    doc.text(c.lineUnit, plotX + 103, ly - 0.5);
  }
  doc.setTextColor(0, 0, 0);
  return h;
}
