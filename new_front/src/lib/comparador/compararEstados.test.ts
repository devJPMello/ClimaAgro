import { anosDoIntervalo, chuvaMensalMedia, media, produtividadePorAno, resumoParaCsv } from './compararEstados';

describe('compararEstados', () => {
  test('chuvaMensalMedia soma por mês de cada ano e tira a média entre os anos', () => {
    const serie = [
      { date: '2024-01-05', value: 10 },
      { date: '2024-01-20', value: 20 },
      { date: '2025-01-10', value: 50 },
      { date: '2025-03-01', value: null },
    ];
    const r = chuvaMensalMedia(serie);
    expect(r).toHaveLength(12);
    expect(r[0]).toBe(40); // (30 + 50) / 2
    expect(r[2]).toBeNull();
  });

  test('produtividadePorAno devolve null para anos sem dado', () => {
    const r = produtividadePorAno(
      [
        { year: 2024, productivity: '3.0' },
        { year: 2024, productivity: 4 },
        { year: 2025, productivity: null },
      ],
      [2024, 2025, 2026]
    );
    expect(r).toEqual({ '2024': 3.5, '2025': null, '2026': null });
  });

  test('anosDoIntervalo aceita extremos invertidos', () => {
    expect(anosDoIntervalo('2026', '2024')).toEqual([2024, 2025, 2026]);
    expect(anosDoIntervalo('x', '2024')).toEqual([]);
  });

  test('media ignora vazios', () => {
    expect(media([null, 2, 4, undefined])).toBe(3);
    expect(media([])).toBeNull();
  });

  test('resumoParaCsv escapa aspas e usa ponto e vírgula', () => {
    const csv = resumoParaCsv([
      { uf: 'MT', temperatura: '26°C', precipitacao: '10mm', produtividadeUltimoAno: '4.5 t/ha', alertas: 3, produtividadeMediaPeriodo: 4.1, chuvaMensalMediaPeriodo: null },
    ]);
    expect(csv.split(String.fromCharCode(10))[1]).toBe('"MT";"26°C";"10mm";"4.5 t/ha";"3";"4.1";"—"');
  });
});
