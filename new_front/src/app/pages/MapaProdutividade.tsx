import { useEffect, useMemo } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MapPin } from 'lucide-react';
import { BrazilMap } from '../components/maps/BrazilMap';
import { MapMetricLegend } from '../components/maps/MapMetricLegend';
import { IbgeMunicipiosChoroplethMap } from '../components/maps/IbgeMunicipiosChoroplethMap';
import { buildProductivityByIbgeCodarea, buildValuesByUfFromProductivityRows } from '../components/maps/brazilMapConfig';
import { getDashboardSummary } from '../../lib/api/climateApi';
import {
  listAllProductivityForYear,
  listProductivityProductLabels,
  listProductivityRecords,
} from '../../lib/api/productivityApi';
import { buildProductivityCropSelectOptions, getProductivitySeasonOptions } from '../../lib/filters/appFilters';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';

type Indicador = { label: string; valor: string; variacao?: string; positivo?: boolean; descricao?: string };

type CropSelectOption = { value: string; label: string };

const EMPTY_MUNICIPAL_CHOROPLETH = {
  valuesByCodarea: {} as Record<string, number>,
  nameByCodarea: {} as Record<string, string>,
};

export function MapaProdutividade() {
  const seasonOptions = useMemo(() => getProductivitySeasonOptions(), []);
  const cropOptionsRes = useAsyncResource<CropSelectOption[]>(async () => {
    const res = await listProductivityProductLabels({ state: 'TO' });
    const fromDb = res.success && Array.isArray(res.data) ? res.data : [];
    return buildProductivityCropSelectOptions(fromDb);
  }, []);

  const [cultura, setCultura] = usePersistedState<string>('climaagro.pref.mapaProdutividade.cultura', '');
  const [safra, setSafra] = usePersistedState<string>(
    'climaagro.pref.mapaProdutividade.safra',
    seasonOptions.find((o) => o.value === '2024/25')?.value ?? seasonOptions[0]?.value ?? '2024/25'
  );

  useEffect(() => {
    const opts = cropOptionsRes.data;
    if (!opts?.length || !cultura) return;
    if (!opts.some((o) => o.value === cultura)) setCultura('');
  }, [cropOptionsRes.data, cultura, setCultura]);

  const productLabelForApi = useMemo(() => cultura.trim(), [cultura]);

  const { status, data, error, reload } = useAsyncResource(
    async () => {
      const summary = await getDashboardSummary({ state: 'TO' });
      const seasonTrim = safra.trim();
      const hasCropSeason = Boolean(productLabelForApi) && seasonTrim.length > 0;
      let items: Awaited<ReturnType<typeof listAllProductivityForYear>>;
      if (hasCropSeason) {
        items = await listAllProductivityForYear({
          state: 'TO',
          season: seasonTrim,
          productLabel: productLabelForApi,
        });
      } else {
        const productivity = await listProductivityRecords({
          state: 'TO',
          season: seasonTrim || undefined,
          limit: 100,
        });
        items = productivity.success && Array.isArray(productivity.data) ? productivity.data : [];
      }
      const valuesByUfProdutividade = hasCropSeason ? buildValuesByUfFromProductivityRows(items) : undefined;
      const productivityMunicipioMap = hasCropSeason ? buildProductivityByIbgeCodarea(items) : null;
      const nums = items.map((x) => Number(x.productivity)).filter((x) => Number.isFinite(x));
      const numsAboveZero = nums.filter((x) => x > 0);
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const max = nums.length ? Math.max(...nums) : null;
      const minAboveZero = numsAboveZero.length ? Math.min(...numsAboveZero) : null;
      const zeroProdCount = items.filter((x) => Number(x.productivity) === 0).length;
      const indicators: Indicador[] =
        cultura === ''
          ? []
          : [
              {
                label: 'Produtividade média',
                valor: avg != null ? `${avg.toFixed(2)} t/ha` : '—',
                descricao: avg == null ? 'Sem registros na tabela productivity para esta cultura/safra.' : undefined,
              },
              { label: 'Maior produtividade', valor: max != null ? `${max.toFixed(2)} t/ha` : '—' },
              {
                label: 'Menor produtividade (> 0)',
                valor: minAboveZero != null ? `${minAboveZero.toFixed(2)} t/ha` : '—',
                descricao:
                  nums.length && !numsAboveZero.length
                    ? 'Todos os registos são 0 t/ha; não há mínimo estritamente positivo.'
                    : undefined,
              },
              { label: 'Registros encontrados', valor: String(items.length) },
              ...(zeroProdCount > 0
                ? [
                    {
                      label: 'Municípios com 0 t/ha',
                      valor: String(zeroProdCount),
                    },
                  ]
                : []),
            ];
      return {
        summary,
        indicators,
        mapRevision: Date.now(),
        valuesByUfProdutividade,
        productivityMunicipioMap,
      };
    },
    [productLabelForApi, safra]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Mapa de Produtividade
        </h1>
        <p className="text-muted-foreground">
          Análise geoespacial de produtividade agrícola por região no Tocantins.
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
                  <Select
                    label="Cultura"
                    value={cultura}
                    onChange={(e) => setCultura(e.target.value)}
                    options={
                      cropOptionsRes.data?.length
                        ? cropOptionsRes.data.map(({ value, label }) => ({ value, label }))
                        : [
                            {
                              value: '',
                              label:
                                cropOptionsRes.status === 'loading'
                                  ? 'Carregando culturas…'
                                  : 'Selecione uma cultura',
                            },
                          ]
                    }
                    disabled={cropOptionsRes.status === 'loading'}
                    error={cropOptionsRes.error ?? undefined}
                  />
                  <Select label="Safra" value={safra} onChange={(e) => setSafra(e.target.value)} options={seasonOptions} />
                  <div className="pt-4 border-t border-border">
                    <MapMetricLegend metric="produtividade" />
                  </div>
                </CardBody>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card className="relative">
                <CardBody className="p-0">
                  {!productLabelForApi ? (
                    <IbgeMunicipiosChoroplethMap
                      metric="produtividade"
                      valuesByCodarea={EMPTY_MUNICIPAL_CHOROPLETH.valuesByCodarea}
                      nameByCodarea={EMPTY_MUNICIPAL_CHOROPLETH.nameByCodarea}
                      dataRevision={payload.mapRevision}
                    />
                  ) : payload.productivityMunicipioMap &&
                    Object.keys(payload.productivityMunicipioMap.valuesByCodarea).length > 0 ? (
                    <IbgeMunicipiosChoroplethMap
                      metric="produtividade"
                      valuesByCodarea={payload.productivityMunicipioMap.valuesByCodarea}
                      nameByCodarea={payload.productivityMunicipioMap.nameByCodarea}
                      dataRevision={payload.mapRevision}
                    />
                  ) : (
                    <BrazilMap
                      metric="produtividade"
                      valuesByUf={payload.valuesByUfProdutividade}
                      dataRevision={payload.mapRevision}
                    />
                  )}
                </CardBody>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>
                  {!productLabelForApi ? (
                    'Mapa do Tocantins com divisão municipal (IBGE). Selecione uma cultura e uma safra para colorir por produtividade (t/ha).'
                  ) : payload.productivityMunicipioMap &&
                    Object.keys(payload.productivityMunicipioMap.valuesByCodarea).length > 0 ? (
                    'Mapa municipal: cada polígono é um município do Tocantins (IBGE); a cor segue a legenda (t/ha).'
                  ) : (
                    'Não foi possível casar municípios pela malha IBGE (falta de código IBGE nos registros); mapa por UF quando houver média.'
                  )}
                </span>
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
