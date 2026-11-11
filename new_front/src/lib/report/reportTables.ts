import {
  buildInsights,
  climateTotals,
  mainCrop,
  periodLabel,
  productivityByCrop,
  productivityByYear,
  monthNameOf,
  type ReportModel,
} from './reportModel';

export type ReportMeta = { titulo: string; local: string };

/** Planilha .xlsx real, com uma aba para cada bloco de dados (a biblioteca só é carregada na hora de exportar). */
export async function buildReportXlsx(meta: ReportMeta, model: ReportModel, generatedAt = new Date()): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const head = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#dcfce7', textColor: '#166534' });
  const num = (value: number | null, format: string) => (value == null || !Number.isFinite(value) ? null : { value, type: Number, format });
  const text = (value: string | number | null) => (value == null ? null : { value: String(value) });

  const t = climateTotals(model.climate);
  const crop = mainCrop(model.productivity);
  const cropYears = productivityByYear(model.productivity, crop ?? undefined);
  const cropAvg = cropYears.length ? cropYears.reduce((a, b) => a + b.average, 0) / cropYears.length : null;

  const summary: Array<Array<unknown>> = [
    [head('Indicador'), head('Valor'), head('Unidade'), head('Observação')],
    [text('Relatório'), text(meta.titulo), null, null],
    [text('Estado'), text(model.stateLabel), null, null],
    [text('Período'), text(periodLabel(model)), null, null],
    [text('Gerado em'), text(generatedAt.toLocaleString('pt-BR')), null, null],
  ];
  if (t.monthsWithData > 0) {
    summary.push(
      [text('Temperatura média'), num(t.avgTemperature, '0.0'), text('°C'), text(`${t.monthsWithData} meses com dados`)],
      [text('Chuva acumulada'), num(t.totalRainfall, '#,##0.0'), text('mm'), null],
      [text('Umidade média'), num(t.avgHumidity, '0'), text('%'), null],
      [text('Vento médio'), num(t.avgWind, '0.0'), text('km/h'), null]
    );
    if (t.rainiest) summary.push([text('Mês mais chuvoso'), text(monthNameOf(t.rainiest.ym)), text('mm'), num(t.rainiest.rainfall, '0.0')]);
    if (t.driest) summary.push([text('Mês mais seco'), text(monthNameOf(t.driest.ym)), text('mm'), num(t.driest.rainfall, '0.0')]);
  }
  if (cropAvg != null) {
    summary.push([text(`Produtividade média${crop ? ` (${crop})` : ''}`), num(cropAvg, '0.00'), text('t/ha'), text(`${cropYears.length} ano(s)`)]);
  }
  const insights = buildInsights(model);
  if (insights.length) {
    summary.push([null, null, null, null], [head('Leitura dos dados'), null, null, null]);
    insights.forEach((i) => summary.push([text(i), null, null, null]));
  }

  const sheets: Array<{ data: unknown[][]; sheet: string; columns: Array<{ width: number }>; stickyRowsCount?: number }> = [
    { data: summary, sheet: 'Resumo', columns: [{ width: 30 }, { width: 22 }, { width: 10 }, { width: 28 }], stickyRowsCount: 1 },
  ];

  if (model.climate?.length) {
    sheets.push({
      sheet: 'Clima mensal',
      columns: [{ width: 10 }, { width: 22 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 8 }],
      stickyRowsCount: 1,
      data: [
        [head('Mês (AAAA-MM)'), head('Mês'), head('Chuva (mm)'), head('Temp. média (°C)'), head('Umidade (%)'), head('Vento (km/h)'), head('Dias')],
        ...model.climate.map((m) => [
          text(m.ym),
          text(monthNameOf(m.ym)),
          num(m.rainfall, '#,##0.0'),
          num(m.temperature, '0.0'),
          num(m.humidity, '0'),
          num(m.wind, '0.0'),
          { value: m.days, type: Number },
        ]),
      ],
    });
  }

  if (model.productivity.length) {
    sheets.push({
      sheet: 'Produtividade',
      columns: [{ width: 28 }, { width: 8 }, { width: 28 }, { width: 18 }],
      stickyRowsCount: 1,
      data: [
        [head('Cultura'), head('Ano'), head('Local'), head('Produtividade (t/ha)')],
        ...[...model.productivity]
          .sort((a, b) => a.crop.localeCompare(b.crop, 'pt-BR') || (a.year ?? 0) - (b.year ?? 0))
          .map((r) => [text(r.crop), r.year != null ? { value: r.year, type: Number } : null, text(r.place), num(r.value, '0.00')]),
      ],
    });
    sheets.push({
      sheet: 'Por cultura',
      columns: [{ width: 28 }, { width: 12 }, { width: 18 }],
      stickyRowsCount: 1,
      data: [
        [head('Cultura'), head('Registros'), head('Média (t/ha)')],
        ...productivityByCrop(model.productivity).map((c) => [text(c.crop), { value: c.records, type: Number }, num(c.average, '0.00')]),
      ],
    });
  }

  if (model.seasonRows?.length) {
    sheets.push({
      sheet: 'Safra',
      columns: [{ width: 12 }, { width: 18 }, { width: 13 }, { width: 15 }, { width: 13 }, { width: 18 }],
      stickyRowsCount: 1,
      data: [
        [head('Mês (AAAA-MM)'), head('Mês'), head('Chuva (mm)'), head('Temp. média (°C)'), head('Umidade (%)'), head('Produtividade (t/ha)')],
        ...model.seasonRows.map((r) => [text(r.month), text(r.label), num(r.rainfall, '#,##0.0'), num(r.temperature, '0.0'), num(r.humidity, '0'), num(r.productivity, '0.00')]),
      ],
    });
  }

  if (sheets.length === 1) {
    sheets[0].data.push([null, null, null, null], [text('Sem dados para o estado e o período escolhidos.'), null, null, null]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeXlsxFile(sheets as any).toBlob();
}

function csvValue(v: string | number | null): string {
  if (v == null) return '""';
  if (typeof v === 'number') return Number.isFinite(v) ? `"${String(v).replace('.', ',')}"` : '""';
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * CSV em formato "longo" (uma linha por mês e por variável), separador `;` e vírgula decimal:
 * abre direto no Excel em português, no R ou no Python.
 */
export function buildReportCsv(model: ReportModel): string {
  const header = ['secao', 'periodo', 'cultura', 'variavel', 'valor', 'unidade', 'local'];
  const rows: Array<Array<string | number | null>> = [];
  const place = model.stateLabel;

  for (const m of model.climate ?? []) {
    if (m.days <= 0) continue;
    rows.push(['Clima', m.ym, null, 'Chuva', m.rainfall, 'mm', place]);
    rows.push(['Clima', m.ym, null, 'Temperatura média', m.temperature, '°C', place]);
    rows.push(['Clima', m.ym, null, 'Umidade média', m.humidity, '%', place]);
    rows.push(['Clima', m.ym, null, 'Vento médio', m.wind, 'km/h', place]);
  }
  for (const r of model.productivity) {
    rows.push(['Produtividade', r.year != null ? String(r.year) : null, r.crop, 'Produtividade', r.value, 't/ha', r.place]);
  }
  for (const r of model.seasonRows ?? []) {
    const period = r.month || r.label;
    rows.push(['Safra', period, null, 'Chuva', r.rainfall, 'mm', place]);
    rows.push(['Safra', period, null, 'Temperatura média', r.temperature, '°C', place]);
    rows.push(['Safra', period, null, 'Umidade média', r.humidity, '%', place]);
    rows.push(['Safra', period, null, 'Produtividade', r.productivity, 't/ha', place]);
  }

  return [header, ...rows].map((r) => r.map(csvValue).join(';')).join(String.fromCharCode(13, 10));
}

