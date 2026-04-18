import { useMemo } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MapPin } from 'lucide-react';
import { BrazilMap } from '../components/maps/BrazilMap';
import { MapMetricLegend } from '../components/maps/MapMetricLegend';
import type { BrazilMapMetric } from '../components/maps/brazilMapConfig';
import { buildValuesByUfFromDashboard } from '../components/maps/brazilMapConfig';
import { getDashboardSummary, listClimateRecords, type ClimateListResponse } from '../../lib/api/climateApi';
import type { DashboardSummaryDto } from '../../lib/api/contracts/climate';
import { TOCANTINS_CITY_VALUE_TO_NAME } from '../../lib/geo/tocantinsCities';
import { CLIMATE_PERIOD_OPTIONS, TO_CITY_OPTIONS_WITH_ALL } from '../../lib/filters/appFilters';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';

const MAP_METRIC: BrazilMapMetric = 'temperatura';

type PeriodCityRow = {
  estado: string;
  temperatura: string;
  temperaturaNum: number | null;
  umidade: string;
  umidadeNum: number | null;
  vento: string;
  ventoNum: number | null;
  precipitacao: string;
  precipitacaoNum: number | null;
  produtividade: string;
  produtividadeNum: number | null;
  alertas: number;
};

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, x) => a + x, 0) / nums.length;
}

function calcPeriodRange(periodo: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  if (periodo === 'ontem') {
    end.setDate(end.getDate() - 1);
    start.setDate(start.getDate() - 1);
  } else if (periodo === '7dias') {
    start.setDate(start.getDate() - 6);
  } else if (periodo === '30dias') {
    start.setDate(start.getDate() - 29);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function MapaClimatico() {
  const [cidade, setCidade] = usePersistedState<string>('climaagro.pref.mapaClimatico.cidade', 'todas');
  const [periodo, setPeriodo] = usePersistedState<string>('climaagro.pref.mapaClimatico.periodo', 'hoje');

  const selectedCityName = cidade !== 'todas' ? TOCANTINS_CITY_VALUE_TO_NAME[cidade] : null;

  const { status, data, error, reload } = useAsyncResource(
    async () => {
      const range = calcPeriodRange(periodo);
      const [summary, climate] = await Promise.all([
        getDashboardSummary({ state: 'TO' }),
        listClimateRecords({
          state: 'TO',
          startDate: range.startDate,
          endDate: range.endDate,
          place: selectedCityName || undefined,
          limit: 1000,
        }),
      ]);
      const rows = climate.success ? climate.data : [];
      const byCity = new Map<string, { temps: number[]; hums: number[]; winds: number[]; precs: number[] }>();
      for (const r of rows as Array<
        ClimateListResponse['data'][number] & { geoData?: { name?: string }; windSpeed?: string | number | null }
      >) {
        const cityName = r.geoData?.name || selectedCityName || 'Tocantins';
        if (!byCity.has(cityName)) byCity.set(cityName, { temps: [], hums: [], winds: [], precs: [] });
        const bucket = byCity.get(cityName)!;
        const t = toNum(r.avgTemperature);
        if (t != null) bucket.temps.push(t);
        const h = toNum(r.humidity);
        if (h != null) bucket.hums.push(h);
        const w = toNum(r.windSpeed);
        if (w != null) bucket.winds.push(w);
        const p = toNum(r.precipitation);
        if (p != null) bucket.precs.push(p);
      }
      const prodByCity = new Map(summary.regioes.map((x) => [x.estado, x]));
      const periodRows: PeriodCityRow[] = [...byCity.entries()].map(([cityName, b]) => {
        const t = avg(b.temps);
        const h = avg(b.hums);
        const w = avg(b.winds);
        const p = b.precs.length ? b.precs.reduce((a, x) => a + x, 0) : null;
        const prod = prodByCity.get(cityName);
        return {
          estado: cityName,
          temperatura: t != null ? `${t.toFixed(1)}°C` : '—',
          temperaturaNum: t,
          umidade: h != null ? `${h.toFixed(1)}%` : '—',
          umidadeNum: h,
          vento: w != null ? `${w.toFixed(1)} km/h` : '—',
          ventoNum: w,
          precipitacao: p != null ? `${p.toFixed(1)}mm` : '—',
          precipitacaoNum: p,
          produtividade: prod?.produtividade ?? '—',
          produtividadeNum: prod?.produtividadeNum ?? null,
          alertas: prod?.alertas ?? 0,
        };
      });
      return {
        summary,
        periodRows,
        mapRevision: Date.now(),
      };
    },
    [periodo, selectedCityName]
  );

  const selectedCityRow = useMemo(() => {
    const rows = data?.periodRows ?? [];
    if (!selectedCityName || !rows.length) return null;
    return (
      rows.find((r) => r.estado === selectedCityName) ||
      rows.find((r) => r.estado.toLowerCase() === selectedCityName.toLowerCase()) ||
      null
    );
  }, [data?.periodRows, selectedCityName]);

  const valuesByUf = useMemo(() => {
    const periodRows = data?.periodRows ?? [];
    if (!periodRows.length) return undefined;
    if (selectedCityRow) {
      const valueByMetric: Record<BrazilMapMetric, number | null | undefined> = {
        temperatura: selectedCityRow.temperaturaNum,
        umidade: selectedCityRow.umidadeNum,
        precipitacao: selectedCityRow.precipitacaoNum,
        vento: selectedCityRow.ventoNum,
        produtividade: selectedCityRow.produtividadeNum,
      };
      const v = valueByMetric[MAP_METRIC];
      if (v != null && !Number.isNaN(Number(v))) {
        return { TO: Number(v) };
      }
    }
    return buildValuesByUfFromDashboard(
      periodRows.map((r) => ({
        uf: 'TO',
        estado: r.estado,
        temperatura: r.temperatura,
        temperaturaNum: r.temperaturaNum,
        umidade: r.umidade,
        umidadeNum: r.umidadeNum,
        vento: r.vento,
        ventoNum: r.ventoNum,
        precipitacao: r.precipitacao,
        precipitacaoNum: r.precipitacaoNum,
        produtividade: r.produtividade,
        produtividadeNum: r.produtividadeNum,
        alertas: r.alertas,
      })),
      MAP_METRIC
    );
  }, [data?.periodRows, selectedCityRow]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Mapa Climático
        </h1>
        <p className="text-muted-foreground">
          Tocantins — cores no mapa usam os dados reais do período selecionado
        </p>
      </div>

      <AsyncStateView
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        isEmpty={(payload) => payload.summary.kpis.length === 0 || payload.periodRows.length === 0}
        empty={
          <Card>
            <CardBody>
              <EmptyState
                icon={MapPin}
                title="Sem dados climáticos para o filtro"
                description="Não há registros para a cidade/período selecionados. Ajuste os filtros e tente novamente."
              />
            </CardBody>
          </Card>
        }
      >
        {(payload) => (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1 self-start">
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <Select label="Cidade (TO)" value={cidade} onChange={(e) => setCidade(e.target.value)} options={TO_CITY_OPTIONS_WITH_ALL} />
                <Select label="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value)} options={CLIMATE_PERIOD_OPTIONS} />
                <div className="pt-4 border-t border-border">
                  <MapMetricLegend metric={MAP_METRIC} />
                </div>
              </CardBody>
            </Card>

            <div className="lg:col-span-3 space-y-4">
              <Card className="relative">
                <CardBody className="p-0">
                  <BrazilMap metric={MAP_METRIC} valuesByUf={valuesByUf} dataRevision={payload.mapRevision} />
                </CardBody>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>
                  {selectedCityName
                    ? `Mapa em TO usa o valor de ${selectedCityName} no período selecionado.`
                    : 'Mapa em TO usa a média das cidades disponíveis no período selecionado.'}
                </span>
              </div>

              {selectedCityRow && (
                <Card>
                  <CardHeader>
                    <CardTitle>Leitura da cidade selecionada</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Cidade</p>
                        <p>{selectedCityRow.estado}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Temperatura</p>
                        <p>{selectedCityRow.temperatura}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Umidade</p>
                        <p>{selectedCityRow.umidade ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Precipitação</p>
                        <p>{selectedCityRow.precipitacao}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vento</p>
                        <p>{selectedCityRow.vento ?? '—'}</p>
                      </div>
                    </div>
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
