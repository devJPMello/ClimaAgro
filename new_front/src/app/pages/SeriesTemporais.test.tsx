import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { SeriesTemporais } from './SeriesTemporais';

vi.mock('recharts', () => {
  const Div = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Div,
    LineChart: Div,
    Line: Div,
    BarChart: Div,
    Bar: Div,
    XAxis: Div,
    YAxis: Div,
    CartesianGrid: Div,
    Tooltip: Div,
    Legend: Div,
  };
});

const mocks = vi.hoisted(() => ({
  getClimateSeriesByUf: vi.fn(async ({ uf }) => ({
    success: true,
    metadata: {
      uf,
      periodo: { start: '2026-01-01', end: '2026-04-16' },
      variavel: 'precipitacao',
      fonte: 'x',
      unidade: 'mm',
    },
    serieTemporal: [{ date: '2026-01-01', uf, value: 10 }],
    estatisticas: { media: 10, min: 10, max: 10 },
    pagination: { limit: 1000, offset: 0, returned: 1 },
  })),
}));

vi.mock('../../lib/api/climateApi', () => ({
  getClimateSeriesByUf: mocks.getClimateSeriesByUf,
  listClimateUfs: vi.fn(async () => [{ value: 'SP', label: 'SP' }]),
  listAllClimateRecordsInRange: vi.fn(async () => []),
}));

vi.mock('../../lib/api/productivityApi', () => ({
  getClimateVsProductivity: vi.fn(async () => ({ success: true, data: [] })),
  listAllProductivityRecords: vi.fn(async () => []),
  listProductivityCropTypes: vi.fn(async () => ({ success: true, data: ['soja'] })),
  listProductivityRecords: vi.fn(async () => ({ success: true, data: [] })),
}));

vi.mock('../../lib/hooks/useIbgeMunicipioSelectOptions', () => ({
  useIbgeMunicipioSelectOptions: () => ({
    options: [{ value: 'Palmas', label: 'Palmas' }],
    loading: false,
    error: null,
  }),
}));

describe('SeriesTemporais UF filter', () => {
  test('seleção de UF dispara requisição de clima para essa sigla', async () => {
    render(<SeriesTemporais />);
    const ufSelect = screen.getAllByRole('combobox')[0];
    await waitFor(() => expect(ufSelect.querySelectorAll('option').length).toBeGreaterThanOrEqual(2));
    await userEvent.selectOptions(ufSelect, 'SP');
    await waitFor(() =>
      expect(mocks.getClimateSeriesByUf).toHaveBeenCalledWith(expect.objectContaining({ uf: 'SP' }))
    );
    expect((ufSelect as HTMLSelectElement).value).toBe('SP');
  });
});
