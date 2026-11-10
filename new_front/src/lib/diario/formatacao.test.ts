import { descreveClima, formataData, rotuloTipo } from './formatacao';

describe('formatação do diário', () => {
  test('formataData troca a ordem sem mexer no fuso', () => {
    expect(formataData('2026-11-08')).toBe('08/11/2026');
    expect(formataData('2026-11-08T00:00:00.000Z')).toBe('08/11/2026');
    expect(formataData('')).toBe('');
  });

  test('rotuloTipo traduz o tipo e devolve o próprio valor se desconhecido', () => {
    expect(rotuloTipo('praga_doenca')).toBe('Praga ou doença observada');
    expect(rotuloTipo('xyz')).toBe('xyz');
  });

  test('descreveClima resume chuva e temperatura, ou avisa que não há dados', () => {
    expect(descreveClima({ dias: 7, chuvaMm: 31.3, tempMedia: 27.4, diasComChuva: 3 })).toBe(
      '31,3 mm de chuva em 3 dia(s), temperatura média de 27,4 °C'
    );
    expect(descreveClima({ dias: 0, chuvaMm: null, tempMedia: null, diasComChuva: null })).toBe('sem dados de clima');
    expect(descreveClima(null)).toBe('sem dados de clima');
  });
});
