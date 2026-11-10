import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Thermometer,
  Droplets,
  Bell,
  TrendingUp,
  MapPin,
  LineChart,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { KPICard } from '../components/ui/KPICard';
import { Card, CardHeader, CardBody, CardTitle, CardDescription } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { DashboardSkeleton } from '../components/ui/PageSkeletons';
import { EstadoDrilldownModal } from '../components/dashboard/EstadoDrilldownModal';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { getDashboardSummary } from '../../lib/api/climateApi';
import { useProfileUfState } from '../../lib/hooks/useProfileUf';
import type { DashboardMetricKey, DashboardRegionRowDto, DashboardSummaryDto } from '../../lib/api/contracts/climate';

const KPI_ICONS: Record<DashboardMetricKey, LucideIcon> = {
  temperature: Thermometer,
  precipitation: Droplets,
  alerts: Bell,
  productivity: TrendingUp,
};

const KPI_COLORS: Record<DashboardMetricKey, string> = {
  temperature: 'bg-primary',
  precipitation: 'bg-blue-400',
  alerts: 'bg-severity-high',
  productivity: 'bg-severity-low',
};

const atalhos = [
  {
    title: 'Mapa Climático',
    description: 'Visualize dados climáticos em tempo real',
    icon: MapPin,
    path: '/mapa-climatico',
    color: 'bg-primary',
  },
  {
    title: 'Alertas',
    description: 'Acompanhe alertas e recomendações',
    icon: Bell,
    path: '/alertas',
    color: 'bg-severity-high',
  },
  {
    title: 'Séries Temporais',
    description: 'Analise tendências históricas',
    icon: LineChart,
    path: '/series-temporais',
    color: 'bg-chart-3',
  },
  {
    title: 'Exportar Relatório',
    description: 'Gere relatórios personalizados',
    icon: FileText,
    path: '/exportar',
    color: 'bg-severity-medium',
  },
];

const CARD_SCROLL_STEP = 272; // card width (256px) + gap (16px)

export function Dashboard() {
  const { uf: ufPerfil, loaded: perfilCarregado } = useProfileUfState();
  const [verTodos, setVerTodos] = useState(false);
  const estado = !verTodos && ufPerfil ? ufPerfil : undefined;
  const { status, data, error, reload } = useAsyncResource(
    () => (perfilCarregado ? getDashboardSummary({ state: estado }) : new Promise<DashboardSummaryDto>(() => {})),
    [perfilCarregado, estado]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [selectedRegiao, setSelectedRegiao] = useState<DashboardRegionRowDto | null>(null);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  useEffect(() => { updateScrollState(); }, [data]);

  function scrollLeft() { scrollRef.current?.scrollBy({ left: -CARD_SCROLL_STEP, behavior: 'smooth' }); }
  function scrollRight() { scrollRef.current?.scrollBy({ left: CARD_SCROLL_STEP, behavior: 'smooth' }); }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          {estado
            ? `Clima e produtividade do seu estado (${estado}), conforme o perfil — últimos dias e último ano com dados na base.`
            : 'Visão geral do clima e da produtividade em todos os estados com dados na base (últimos dias e último ano com dados na base).'}
        </p>
        {ufPerfil && (
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            className="mt-2 text-sm text-primary hover:underline"
          >
            {verTodos ? `Ver só o meu estado (${ufPerfil})` : 'Ver todos os estados'}
          </button>
        )}
      </div>

      <AsyncStateView<DashboardSummaryDto>
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        loading={<DashboardSkeleton />}
        isEmpty={(d) => d.kpis.length === 0 && d.regioes.length === 0}
        empty={
          <Card>
            <CardBody>
              <EmptyState
                icon={MapPin}
                title="Sem dados para exibir"
                description="Não há indicadores disponíveis no momento. Tente novamente mais tarde."
              />
            </CardBody>
          </Card>
        }
      >
        {(summary) => (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {summary.kpis.map((kpi) => {
                const Icon = KPI_ICONS[kpi.metric];
                const { metric: _m, ...kpiProps } = kpi;
                return <KPICard key={kpi.metric} {...kpiProps} icon={Icon} color={KPI_COLORS[kpi.metric]} />;
              })}
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <CardTitle>Resumo por localidade</CardTitle>
                    <CardDescription>
                      {estado ? `Estado do seu perfil (${estado})` : 'Todos os estados com dados na base'} — clima agregado (últimos 14 dias) e produtividade média no último ano agrícola
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground mr-auto sm:mr-2">{summary.regioes.length} {summary.regioes.length === 1 ? 'estado' : 'estados'}</span>
                    <button
                      type="button"
                      onClick={scrollLeft}
                      disabled={!canLeft}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={scrollRight}
                      disabled={!canRight}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                <div
                  ref={scrollRef}
                  onScroll={updateScrollState}
                  className="flex gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {summary.regioes.map((regiao) => (
                    <button
                      key={regiao.uf ?? regiao.estado}
                      type="button"
                      onClick={() => setSelectedRegiao(regiao)}
                      className="flex-shrink-0 w-56 sm:w-64 rounded-xl border border-border bg-card overflow-hidden text-left transition-all duration-150 hover:border-primary/50 hover:shadow-md hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="px-4 py-3 bg-primary/10 border-b border-border">
                        <p className="text-base text-primary">{regiao.uf ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{regiao.estado}</p>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Thermometer className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">Temperatura</span>
                          <span className="ml-auto text-xs">{regiao.temperatura}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Droplets className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">Precipitação</span>
                          <span className="ml-auto text-xs">{regiao.precipitacao}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">Produtividade</span>
                          <span className="ml-auto text-xs">{regiao.produtividade}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Bell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">Alertas</span>
                          <span className="ml-auto text-xs">{regiao.alertas} {regiao.alertas === 1 ? 'alerta' : 'alertas'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </AsyncStateView>

      {selectedRegiao && (
        <EstadoDrilldownModal
          regiao={selectedRegiao}
          onClose={() => setSelectedRegiao(null)}
        />
      )}

      <div>
        <h2 className="text-xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          Acesso Rápido
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {atalhos.map((atalho) => {
            const Icon = atalho.icon;
            return (
              <Link key={atalho.path} to={atalho.path}>
                <Card className="hover:shadow-lg transition-all duration-200 hover:-translate-y-1 h-full">
                  <CardBody>
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${atalho.color} flex items-center justify-center mb-3 sm:mb-4`}>
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-base text-foreground mb-1 sm:mb-2 leading-snug">{atalho.title}</h3>
                    <p className="hidden sm:block text-sm text-muted-foreground mb-4">{atalho.description}</p>
                    <div className="hidden sm:flex items-center gap-1 text-sm text-primary">
                      Acessar <ArrowRight className="w-4 h-4" />
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
