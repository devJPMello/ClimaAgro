import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MapPin } from 'lucide-react';
import { BrazilMap } from '../components/maps/BrazilMap';
import { MapMetricLegend } from '../components/maps/MapMetricLegend';
import { buildValuesByUfFromProductivityRows } from '../components/maps/brazilMapConfig';
import { listClimateUfs } from '../../lib/api/climateApi';
import {
  listAllProductivityForYear,
  listProductivityProductLabels,
} from '../../lib/api/productivityApi';
import { buildProductivityCropSelectOptions } from '../../lib/filters/appFilters';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';

type Indicador = { label: string; valor: string; descricao?: string };

type CropSelectOption = { value: string; label: string };
const MONTH_OPTIONS = [
  { value: 'ALL', label: 'Todos os meses' },
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const YEAR_OPTIONS = [
  { value: '2023-2026', label: '2023–2026 (consolidado)' },
  { value: '2026', label: '2026' },
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
  { value: '2023', label: '2023' },
];

export function MapaProdutividade() {
  const [ufOptions, setUfOptions] = useState<Array<{ value: string; label: string }>>([
    { value: 'ALL', label: 'Brasil (todos)' },
  ]);
  const cropOptionsRes = useAsyncResource<CropSelectOption[]>(async () => {
    const res = await listProductivityProductLabels();
    const fromDb = res.success && Array.isArray(res.data) ? res.data : [];
    return buildProductivityCropSelectOptions(fromDb);
  }, []);

  const [cultura, setCultura] = usePersistedState<string>('climaagro.pref.mapaProdutividade.cultura', '');
  const [uf, setUf] = usePersistedState<string>('climaagro.pref.mapaProdutividade.uf', 'ALL');
  const [mes, setMes] = usePersistedState<string>('climaagro.pref.mapaProdutividade.mes', 'ALL');
  const [ano, setAno] = usePersistedState<string>('climaagro.pref.mapaProdutividade.ano', '2023-2026');

  useEffect(() => {
    const opts = cropOptionsRes.data;
    if (!opts?.length || !cultura) return;
    if (!opts.some((o) => o.value === cultura)) setCultura('');
  }, [cropOptionsRes.data, cultura, setCultura]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listClimateUfs();
        if (!cancelled && data.length) setUfOptions(data);
      } catch {
        // Mantém fallback local no select
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const productLabelForApi = useMemo(() => cultura.trim(), [cultura]);

  const { status, data, error, reload } = useAsyncResource(
    async () => {
      const targetUfs =
        uf === 'ALL'
          ? ufOptions.map((o) => o.value).filter((v) => /^[A-Z]{2}$/.test(v))
          : [/^[A-Z]{2}$/.test(uf) ? uf : null].filter(Boolean) as string[];

      const responses = await Promise.all(
        targetUfs.map((stateUf) =>
          (async () => {
            if (ano === '2023-2026') {
              const years = [2023, 2024, 2025, 2026];
              const byYear = await Promise.all(
                years.map((year) =>
                  listAllProductivityForYear({
                    state: stateUf,
                    year,
                    mesAno: mes === 'ALL' ? undefined : `${year}-${mes}`,
                    productLabel: productLabelForApi || undefined,
                  })
                )
              );
              return byYear.flat();
            }
            const yearNum = Number(ano);
            return listAllProductivityForYear({
              state: stateUf,
              year: Number.isFinite(yearNum) ? yearNum : undefined,
              mesAno: mes === 'ALL' ? undefined : `${ano}-${mes}`,
              productLabel: productLabelForApi || undefined,
            });
          })()
        )
      );
      const items = responses.flat();
      const valuesByUfProdutividade = buildValuesByUfFromProductivityRows(items);
      const nums = items.map((x) => Number(x.productivity)).filter((x) => Number.isFinite(x));
      const numsAboveZero = nums.filter((x) => x > 0);
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const max = nums.length ? Math.max(...nums) : null;
      const minAboveZero = numsAboveZero.length ? Math.min(...numsAboveZero) : null;
      const zeroProdCount = items.filter((x) => Number(x.productivity) === 0).length;
      const indicators: Indicador[] =
        productLabelForApi === ''
          ? []
          : [
              {
                label: 'Produtividade média',
                valor: avg != null ? `${avg.toFixed(2)} t/ha` : '—',
                descricao: avg == null ? 'Sem registros na tabela productivity para esta cultura/mês-ano.' : undefined,
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
                      label: 'Registros com 0 t/ha',
                      valor: String(zeroProdCount),
                    },
                  ]
                : []),
            ];
      return {
        indicators,
        mapRevision: Date.now(),
        valuesByUfProdutividade,
        itemsCount: items.length,
      };
    },
    [ano, mes, productLabelForApi, uf, ufOptions]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Mapa de Produtividade
        </h1>
        <p className="text-muted-foreground">
          Análise geoespacial de produtividade agrícola por estado (UF).
        </p>
      </div>

      <AsyncStateView
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        isEmpty={() => false}
        empty={<></>}
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
                  <Select label="Estado (UF)" value={uf} onChange={(e) => setUf(e.target.value)} options={ufOptions} />
                  <Select label="Mês" value={mes} onChange={(e) => setMes(e.target.value)} options={MONTH_OPTIONS} />
                  <Select label="Ano" value={ano} onChange={(e) => setAno(e.target.value)} options={YEAR_OPTIONS} />
                  <div className="pt-4 border-t border-border">
                    <MapMetricLegend metric="produtividade" />
                  </div>
                </CardBody>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card className="relative">
                <CardBody className="p-0">
                  <BrazilMap
                    metric="produtividade"
                    valuesByUf={payload.valuesByUfProdutividade}
                    dataRevision={payload.mapRevision}
                  />
                </CardBody>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>
                  Mapa estadual: agregação por UF para o mês-ano e cultura selecionados. Quando o filtro de estado está em
                  Brasil, todas as UFs com dado são coloridas.
                </span>
              </div>

              {payload.itemsCount === 0 && (
                <Card>
                  <CardBody>
                    <EmptyState
                      icon={MapPin}
                      title="Sem dados de produtividade"
                      description="Não há registros para a cultura, estado, mês e ano escolhidos. Altere os filtros à esquerda."
                    />
                  </CardBody>
                </Card>
              )}

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
