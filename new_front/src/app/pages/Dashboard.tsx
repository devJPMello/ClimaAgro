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
  type LucideIcon,
} from 'lucide-react';
import { KPICard } from '../components/ui/KPICard';
import { Card, CardHeader, CardBody, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { getDashboardSummary } from '../../lib/api/climateApi';
import type { DashboardMetricKey, DashboardSummaryDto } from '../../lib/api/contracts/climate';

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

export function Dashboard() {
  const { status, data, error, reload } = useAsyncResource(() => getDashboardSummary(), []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral do clima e da produtividade em estados selecionados dinamicamente (últimos dias e último ano com
          dados na base).
        </p>
      </div>

      <AsyncStateView<DashboardSummaryDto>
        status={status}
        data={data}
        error={error}
        onRetry={reload}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {summary.kpis.map((kpi, index) => {
                const Icon = KPI_ICONS[kpi.metric];
                const { metric: _m, ...kpiProps } = kpi;
                return <KPICard key={index} {...kpiProps} icon={Icon} color={KPI_COLORS[kpi.metric]} />;
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Resumo por localidade</CardTitle>
                <CardDescription>
                  Cinco estados selecionados dinamicamente — clima agregado na malha estadual (últimos 14 dias) e produtividade
                  média no último ano agrícola com dados na base
                </CardDescription>
              </CardHeader>
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="pb-3 text-sm text-muted-foreground">Estado</th>
                        <th className="pb-3 text-sm text-muted-foreground">Temperatura</th>
                        <th className="pb-3 text-sm text-muted-foreground">Precipitação</th>
                        <th className="pb-3 text-sm text-muted-foreground">Produtividade</th>
                        <th className="pb-3 text-sm text-muted-foreground">Alertas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.regioes.map((regiao, index) => (
                        <tr key={index} className="border-b border-border last:border-0">
                          <td className="py-4 text-sm">
                            {regiao.uf ? `${regiao.estado} (${regiao.uf})` : regiao.estado}
                          </td>
                          <td className="py-4 text-sm">{regiao.temperatura}</td>
                          <td className="py-4 text-sm">{regiao.precipitacao}</td>
                          <td className="py-4 text-sm">{regiao.produtividade}</td>
                          <td className="py-4">
                            <Badge variant={regiao.alertas > 3 ? 'high' : 'medium'}>
                              {regiao.alertas} {regiao.alertas === 1 ? 'alerta' : 'alertas'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </AsyncStateView>

      <div>
        <h2 className="text-xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          Acesso Rápido
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {atalhos.map((atalho, index) => {
            const Icon = atalho.icon;
            return (
              <Link key={index} to={atalho.path}>
                <Card className="hover:shadow-lg transition-all duration-200 hover:-translate-y-1 h-full">
                  <CardBody>
                    <div className={`w-12 h-12 rounded-lg ${atalho.color} flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-base text-foreground mb-2">{atalho.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{atalho.description}</p>
                    <div className="flex items-center gap-1 text-sm text-primary">
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
