import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Thermometer, Droplets, TrendingUp, Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Modal } from '../ui/Modal';
import { getClimateSeriesByUf } from '../../../lib/api/climateApi';
import type { DashboardRegionRowDto } from '../../../lib/api/contracts/climate';

type TabKey = 'temperatura' | 'precipitacao' | 'produtividade' | 'alertas';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Thermometer }> = [
  { key: 'temperatura', label: 'Temperatura', icon: Thermometer },
  { key: 'precipitacao', label: 'Precipitação', icon: Droplets },
  { key: 'produtividade', label: 'Produtividade', icon: TrendingUp },
  { key: 'alertas', label: 'Alertas', icon: Bell },
];

type ChartPoint = { label: string; atual: number | null; anterior: number | null };

function isoToShortLabel(date: string): string {
  const [, m, d] = date.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${parseInt(d, 10)}/${months[parseInt(m, 10) - 1]}`;
}

function buildDateRange(daysBack: number, yearOffset = 0) {
  const end = new Date();
  end.setFullYear(end.getFullYear() + yearOffset);
  const start = new Date(end);
  start.setDate(end.getDate() - (daysBack - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function useSeriesWithComparison(
  uf: string,
  variavel: 'temperatura_media' | 'precipitacao',
  enabled: boolean,
) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (!enabled || !uf || fetched.current) return;
    fetched.current = true;

    let cancelled = false;
    setLoading(true);

    const curr = buildDateRange(30, 0);
    const prev = buildDateRange(30, -1);

    void Promise.all([
      getClimateSeriesByUf({ uf, start: curr.start, end: curr.end, variavel, limit: 200 }),
      getClimateSeriesByUf({ uf, start: prev.start, end: prev.end, variavel, limit: 200 }),
    ])
      .then(([currRes, prevRes]) => {
        if (cancelled) return;
        const currRows = currRes.serieTemporal ?? [];
        const prevRows = prevRes.serieTemporal ?? [];
        const len = Math.max(currRows.length, prevRows.length);
        const points: ChartPoint[] = Array.from({ length: len }, (_, i) => ({
          label: currRows[i]?.date ? isoToShortLabel(currRows[i].date) : `D${i + 1}`,
          atual: currRows[i]?.value ?? null,
          anterior: prevRows[i]?.value ?? null,
        }));
        setData(points);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar série.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [uf, variavel, enabled]);

  return { data, loading, error };
}

interface Props {
  regiao: DashboardRegionRowDto;
  onClose: () => void;
}

export function EstadoDrilldownModal({ regiao, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('temperatura');
  const uf = regiao.uf ?? '';
  const currYear = new Date().getFullYear();

  const { data: tempData, loading: tempLoading, error: tempError } =
    useSeriesWithComparison(uf, 'temperatura_media', activeTab === 'temperatura');
  const { data: precipData, loading: precipLoading, error: precipError } =
    useSeriesWithComparison(uf, 'precipitacao', activeTab === 'precipitacao');

  const isClimaTab = activeTab === 'temperatura' || activeTab === 'precipitacao';
  const chartData   = activeTab === 'temperatura' ? tempData   : precipData;
  const chartLoading = activeTab === 'temperatura' ? tempLoading : precipLoading;
  const chartError   = activeTab === 'temperatura' ? tempError   : precipError;
  const unit         = activeTab === 'temperatura' ? '°C' : 'mm';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${regiao.estado} (${regiao.uf ?? '—'}) — últimos 30 dias`}
      size="xl"
    >
      {/* Resumo rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Temperatura', value: regiao.temperatura },
          { label: 'Precipitação', value: regiao.precipitacao },
          { label: 'Produtividade', value: regiao.produtividade },
          { label: 'Alertas', value: String(regiao.alertas) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
            <p className="text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-0 border-b border-border mb-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap shrink-0 transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas — clima */}
      {isClimaTab && (
        <div>
          {chartLoading && (
            <div className="h-60 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
              Carregando série…
            </div>
          )}
          {!chartLoading && chartError && (
            <div className="h-60 flex items-center justify-center text-sm text-destructive">
              {chartError}
            </div>
          )}
          {!chartLoading && !chartError && chartData.length === 0 && (
            <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
              Sem dados para o período selecionado.
            </div>
          )}
          {!chartLoading && !chartError && chartData.length > 0 && (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    width={50}
                    unit={unit}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) =>
                      value != null ? `${value}${unit}` : '—'
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="atual"
                    name={`${currYear} (atual)`}
                    stroke="#1976D2"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    name={`${currYear - 1} (ano anterior)`}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground mt-2 text-right">
                Série mensal agregada —{' '}
                {activeTab === 'temperatura' ? 'temperatura média (°C)' : 'precipitação total (mm)'}
              </p>
            </>
          )}
        </div>
      )}

      {/* Conteúdo — produtividade */}
      {activeTab === 'produtividade' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Produtividade média — último ano agrícola
            </p>
            <p
              className="text-3xl font-semibold text-foreground"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {regiao.produtividade}
            </p>
            {regiao.produtividadeNum != null && (
              <p className="text-xs text-muted-foreground mt-1">
                {regiao.produtividadeNum.toFixed(2)} t/ha
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Para analisar a série histórica completa de produtividade para{' '}
            <strong>{regiao.estado}</strong>, acesse a página de Séries Temporais com este estado
            pré-selecionado.
          </p>
          <Link
            to="/series-temporais"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2"
          >
            Ver série histórica em Séries Temporais →
          </Link>
        </div>
      )}

      {/* Conteúdo — alertas */}
      {activeTab === 'alertas' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">Alertas climáticos ativos</p>
            <p
              className={`text-4xl font-semibold ${regiao.alertas > 0 ? 'text-destructive' : 'text-severity-low'}`}
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {regiao.alertas}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {regiao.alertas === 0
                ? `Nenhum alerta ativo em ${regiao.estado} no momento.`
                : `${regiao.alertas} alerta${regiao.alertas > 1 ? 's' : ''} ativo${regiao.alertas > 1 ? 's' : ''} em ${regiao.estado}.`}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Veja detalhes completos — severidade, localidade e recomendações agronômicas — na
            página de Alertas.
          </p>
          <Link
            to="/alertas"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2"
          >
            Ver todos os alertas →
          </Link>
        </div>
      )}
    </Modal>
  );
}
