import {
  buildInsights,
  buildKpis,
  climateTotals,
  emptyReportModel,
  formatNumber,
  mainCrop,
  periodLabel,
  productivityByCrop,
  productivityByYear,
  rainfallByCalendarMonth,
  rainfallByFullYear,
  sampleCorrelation,
  shortMonthLabel,
  wettestSeason,
  type MonthlyClimate,
  type ReportModel,
} from './reportModel';

/** 2 anos completos: chuva forte de nov a mar, seca de jun a ago. */
function climate(): MonthlyClimate[] {
  const rainByMonth = [200, 180, 160, 80, 20, 5, 3, 8, 40, 110, 170, 190];
  const out: MonthlyClimate[] = [];
  for (const year of [2025, 2026]) {
    rainByMonth.forEach((r, i) => {
      out.push({
        ym: `${year}-${String(i + 1).padStart(2, '0')}`,
        label: '',
        days: 30,
        temperature: 25 + i * 0.2,
        rainfall: year === 2026 ? r * 1.1 : r,
        humidity: 60,
        wind: 10,
      });
    });
  }
  return out;
}

function model(over: Partial<ReportModel> = {}): ReportModel {
  return { ...emptyReportModel('comparativo', 'Mato Grosso (MT)', '2025-01-01', '2026-12-31'), climate: climate(), ...over };
}

describe('modelo do relatório', () => {
  test('formatNumber usa vírgula e devolve traço para vazio', () => {
    expect(formatNumber(1234.567, 1)).toBe('1.234,6');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  test('shortMonthLabel', () => {
    expect(shortMonthLabel('2026-03')).toBe('Mar/26');
    expect(shortMonthLabel('xx')).toBe('xx');
  });

  test('climateTotals acha o mês mais chuvoso e o mais seco, ignorando meses sem dados', () => {
    const c = climate();
    c.push({ ym: '2027-01', label: '', days: 0, temperature: null, rainfall: null, humidity: null, wind: null });
    const t = climateTotals(c);
    expect(t.monthsWithData).toBe(24);
    expect(t.rainiest?.ym).toBe('2026-01');
    expect(t.driest?.ym).toBe('2025-07');
    expect(climateTotals(null).monthsWithData).toBe(0);
  });

  test('rainfallByFullYear só inclui anos com os 12 meses', () => {
    const c = climate().filter((m) => m.ym !== '2026-12');
    expect(rainfallByFullYear(c).map((y) => y.year)).toEqual([2025]);
  });

  test('wettestSeason acha os 5 meses mais chuvosos (circular) e a fatia do total', () => {
    const w = wettestSeason(rainfallByCalendarMonth(climate()));
    expect(w).not.toBeNull();
    expect(w!.start).toBe(10); // novembro
    expect(w!.end).toBe(2); // março
    expect(w!.share).toBeGreaterThan(0.7);
    expect(wettestSeason([1, 2, 3])).toBeNull();
  });

  test('productivityByYear e mainCrop', () => {
    const records = [
      { year: 2024, crop: 'Soja', value: 3.0, place: 'MT' },
      { year: 2024, crop: 'Soja', value: 4.0, place: 'MT' },
      { year: 2025, crop: 'Soja', value: 3.8, place: 'MT' },
      { year: 2025, crop: 'Milho', value: 6.0, place: 'MT' },
      { year: 2025, crop: 'Milho', value: null, place: 'MT' },
    ];
    expect(productivityByYear(records, 'Soja')).toEqual([
      { year: 2024, average: 3.5, records: 2 },
      { year: 2025, average: 3.8, records: 1 },
    ]);
    expect(mainCrop(records)).toBe('Soja');
    expect(mainCrop([])).toBeNull();
  });

  test('mainCrop prefere soja/milho a uma cultura com mais registros, e ignora produtividade zero', () => {
    const records = [
      { year: 2024, crop: 'Cana-de-açúcar', value: 80, place: 'MT' },
      { year: 2025, crop: 'Cana-de-açúcar', value: 81, place: 'MT' },
      { year: 2026, crop: 'Cana-de-açúcar', value: 82, place: 'MT' },
      { year: 2026, crop: 'Soja', value: 3.9, place: 'MT' },
      { year: 2026, crop: 'Alho', value: 0, place: 'MT' },
    ];
    expect(mainCrop(records)).toBe('Soja');
    expect(productivityByCrop(records).map((c) => c.crop)).not.toContain('Alho');
    expect(mainCrop([{ year: 2026, crop: 'Alho', value: 0, place: 'MT' }])).toBeNull();
    expect(mainCrop(records.filter((r) => r.crop !== 'Soja'))).toBe('Cana-de-açúcar');
  });

  test('sampleCorrelation', () => {
    expect(sampleCorrelation([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }])).toBeCloseTo(1);
    expect(sampleCorrelation([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(sampleCorrelation([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])).toBeNull();
  });

  test('buildKpis traz até 4 destaques e respeita o tipo do relatório', () => {
    const k = buildKpis(model({ kind: 'clima' }));
    expect(k.length).toBe(4);
    expect(k[0].label).toBe('Temperatura média');
    const p = buildKpis(
      model({ kind: 'produtividade', climate: null, productivity: [{ year: 2025, crop: 'Soja', value: 3.5, place: 'MT' }] })
    );
    expect(p[0].label).toContain('Produtividade média');
  });

  test('buildInsights gera frases com números, sem inventar quando falta dado', () => {
    const texts = buildInsights(
      model({
        productivity: [
          { year: 2025, crop: 'Soja', value: 3.5, place: 'MT' },
          { year: 2026, crop: 'Soja', value: 3.9, place: 'MT' },
        ],
      })
    );
    expect(texts.some((t) => /chuva se concentra de novembro a março/.test(t))).toBe(true);
    expect(texts.some((t) => /2026 teve 10% mais chuva que 2025/.test(t))).toBe(true);
    expect(texts.some((t) => /melhor ano foi 2026/.test(t))).toBe(true);
    expect(buildInsights(emptyReportModel('clima', 'MT', '2026-01-01', '2026-12-31'))).toEqual([]);
  });

  test('periodLabel', () => {
    expect(periodLabel({ startDate: '2024-01-01', endDate: '2026-12-31' })).toBe('2024 a 2026');
    expect(periodLabel({ startDate: '2024-01-01', endDate: '2024-12-31' })).toBe('2024');
    expect(periodLabel({ startDate: '', endDate: '', season: '2024/25' })).toBe('Safra 2024/25');
  });
});
