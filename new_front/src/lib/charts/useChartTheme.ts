import { useThemeOptional } from '../../app/contexts/ThemeContext';

/** Cores dos gráficos (Recharts) que acompanham o tema claro/escuro. */
export function useChartTheme() {
  const theme = useThemeOptional()?.theme ?? 'light';
  const dark = theme === 'dark';
  return {
    grid: dark ? '#1E293B' : '#E2E8F0',
    axis: dark ? '#94A3B8' : '#64748B',
    tooltipStyle: {
      backgroundColor: dark ? '#131720' : '#FFFFFF',
      border: `1px solid ${dark ? '#1E293B' : '#E2E8F0'}`,
      borderRadius: '8px',
      color: dark ? '#F1F5F9' : '#0F172A',
    },
    tooltipLabelStyle: { color: dark ? '#F1F5F9' : '#0F172A', fontWeight: 600 },
  };
}
