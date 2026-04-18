import { useMemo } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MapPin } from 'lucide-react';
import { BrazilMap } from '../components/maps/BrazilMap';
import { MapMetricLegend } from '../components/maps/MapMetricLegend';
import { buildValuesByUfFromDashboard } from '../components/maps/brazilMapConfig';
import { getDashboardSummary } from '../../lib/api/climateApi';
import type { DashboardSummaryDto } from '../../lib/api/contracts/climate';
import { listProductivityRecords } from '../../lib/api/productivityApi';
import { PRODUCTIVITY_CROP_OPTIONS, getProductivityYearOptions } from '../../lib/filters/appFilters';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';

type Indicador = { label: string; valor: string; variacao?: string; positivo?: boolean; descricao?: string };

export function MapaProdutividade() {
  const yearOptions = useMemo(() => getProductivityYearOptions(), []);
  const [cultura, setCultura] = usePersistedState<string>('climaagro.pref.mapaProdutividade.cultura', '');
  const [ano, setAno] = usePersistedState<string>('climaagro.pref.mapaProdutividade.ano', yearOptions[0]?.value || '2026');

  const { status, data, error, reload } = useAsyncResource(
    async () => {
      const [summary, productivity] = await Promise.all([
        getDashboardSummary({ state: 'TO' }),
        listProductivityRecords({ state: 'TO', cropType: cultura || undefined, year: ano, limit: 100 }),
      ]);
      const items = productivity.success ? productivity.data : [];
      const nums = items.map((x) => Number(x.productivity)).filter((x) => Number.isFinite(x));
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const max = nums.length ? Math.max(...nums) : null;
      const min = nums.length ? Math.min(...nums) : null;
      const indicators: Indicador[] =
        cultura === ''
          ? []
          : [
              {
                label: 'Produtividade média',
                valor: avg != null ? `${avg.toFixed(2)} t/ha` : '—',
                descricao: avg == null ? 'Sem registros reais para a cultura/ano selecionados.' : undefined,
              },
              { label: 'Maior produtividade', valor: max != null ? `${max.toFixed(2)} t/ha` : '—' },
              { label: 'Menor produtividade', valor: min != null ? `${min.toFixed(2)} t/ha` : '—' },
              { label: 'Registros encontrados', valor: String(items.length) },
            ];
      return {
        summary,
        indicators,
        mapRevision: Date.now(),
      };
    },
    [cultura, ano]
  );

  const valuesByUf = useMemo(() => {
    if (!data?.summary?.regioes?.length) return undefined;
    return buildValuesByUfFromDashboard(data.summary.regioes, 'produtividade');
  }, [data?.summary]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Mapa de Produtividade
        </h1>
        <p className="text-muted-foreground">
          Tocantins — produtividade estadual (t/ha) alinhada ao dashboard; cultura e ano em evolução
        </p>
      </div>

      <AsyncStateView
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        isEmpty={(payload) => payload.summary.regioes.length === 0}
        empty={
          <Card>
            <CardBody>
              <EmptyState
                icon={MapPin}
                title="Sem dados de produtividade"
                description="Não há registros de produtividade disponíveis para os filtros selecionados."
              />
            </CardBody>
          </Card>
        }
      >
        {(payload) => (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card className="self-start">
                <CardHeader>
                  <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardBody className="space-y-4">
                  <Select label="Cultura" value={cultura} onChange={(e) => setCultura(e.target.value)} options={PRODUCTIVITY_CROP_OPTIONS} />
                  <Select label="Ano" value={ano} onChange={(e) => setAno(e.target.value)} options={yearOptions} />
                  <div className="pt-4 border-t border-border">
                    <MapMetricLegend metric="produtividade" />
                  </div>
                </CardBody>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card className="relative">
                <CardBody className="p-0">
                  <BrazilMap metric="produtividade" valuesByUf={valuesByUf} dataRevision={payload.mapRevision} />
                </CardBody>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>Produtividade do Tocantins conforme dados reais cadastrados por cultura e ano.</span>
              </div>

              {cultura && (
                <Card>
                  <CardHeader>
                    <CardTitle>Indicadores da cultura selecionada</CardTitle>
                  </CardHeader>
                  <CardBody className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {payload.indicators.map((ind, index) => (
                      <div key={index} className="space-y-1">
                        <p className="text-xs text-muted-foreground">{ind.label}</p>
                        <p className="text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
                          {ind.valor}
                        </p>
                        {ind.variacao && (
                          <p className={`text-sm ${ind.positivo ? 'text-severity-low' : 'text-destructive'}`}>{ind.variacao}</p>
                        )}
                        {ind.descricao && <p className="text-xs text-muted-foreground">{ind.descricao}</p>}
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}
