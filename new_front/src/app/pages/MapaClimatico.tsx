import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MapPin } from 'lucide-react';
import { BrazilMap } from '../components/maps/BrazilMap';
import { MapMetricLegend } from '../components/maps/MapMetricLegend';
import { normalizeBrazilMapMetric, type BrazilMapMetric } from '../components/maps/brazilMapConfig';
import { getClimateSeriesByUf } from '../../lib/api/climateApi';
import { useClimateUfs } from '../../lib/hooks/useClimateUfs';
import { CLIMATE_PERIOD_OPTIONS } from '../../lib/filters/appFilters';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { useProfileUf } from '../../lib/hooks/useProfileUf';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';
import { formatUfLabel } from '../../lib/geo/brazilStatesMalha';

const UF_ALL_OPTION = { value: 'ALL', label: 'Todos os estados' } as const;

type PeriodStateRow = {
  uf: string;
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

const MAP_METRIC_OPTIONS: Array<{ value: BrazilMapMetric; label: string }> = [
  { value: 'temperatura', label: 'Temperatura' },
  { value: 'umidade', label: 'Umidade' },
  { value: 'precipitacao', label: 'Precipitação' },
  { value: 'vento', label: 'Vento' },
];

export function MapaClimatico() {
  const [uf, setUf] = usePersistedState<string>('climaagro.pref.mapaClimatico.uf.v2', '');
  const [metric, setMetric] = usePersistedState<BrazilMapMetric>('climaagro.pref.mapaClimatico.metric', 'temperatura');
  const [periodo, setPeriodo] = usePersistedState<string>('climaagro.pref.mapaClimatico.periodo', 'hoje');
  const [ufOptions, setUfOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'Selecione ou "Todos os estados"' },
    UF_ALL_OPTION,
  ]);
  const { ufs: climateUfs } = useClimateUfs();
  const profileUf = useProfileUf();

  // Na primeira visita (uf vazio), pré-seleciona a UF do perfil ou "Todos os estados"
  useEffect(() => {
    setUf((prev) => (prev ? prev : profileUf || 'ALL'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUf]);

  useEffect(() => {
    const fixed = normalizeBrazilMapMetric(metric);
    if (fixed !== metric) setMetric(fixed);
  }, [metric, setMetric]);

  useEffect(() => {
    if (!climateUfs.length) return;
    const fromApi = climateUfs
      .map((x) => {
        const value = String(x.value ?? '').trim();
        if (value === 'ALL') return null;
        const sigla = value.toUpperCase();
        return { value: sigla, label: /^[A-Z]{2}$/.test(sigla) ? formatUfLabel(sigla) : x.label };
      })
      .filter((o): o is { value: string; label: string } => o != null);
    setUfOptions([UF_ALL_OPTION, ...fromApi]);
  }, [climateUfs]);

  const { status, data, error, reload } = useAsyncResource(
    async () => {
      const ufValid = uf === 'ALL' || /^[A-Z]{2}$/.test(uf);
      if (!ufValid) {
        return { periodRows: [] as PeriodStateRow[], mapRevision: Date.now() };
      }
      const range = calcPeriodRange(periodo);
      const ufParam = uf === 'ALL' ? 'ALL' : uf;
      /** ALL sem perUf no backend = série nacional (uf sempre ALL); o mapa precisa de uma linha por UF. */
      const perUfBrasil = uf === 'ALL';
      const [temp, hum, wind, precip] = await Promise.all([
        getClimateSeriesByUf({
          uf: ufParam,
          start: range.startDate,
          end: range.endDate,
          variavel: 'temperatura_media',
          perUf: perUfBrasil,
          limit: uf === 'ALL' ? 20000 : 1000,
        }),
        getClimateSeriesByUf({
          uf: ufParam,
          start: range.startDate,
          end: range.endDate,
          variavel: 'umidade',
          perUf: perUfBrasil,
          limit: uf === 'ALL' ? 20000 : 1000,
        }),
        getClimateSeriesByUf({
          uf: ufParam,
          start: range.startDate,
          end: range.endDate,
          variavel: 'vento',
          perUf: perUfBrasil,
          limit: uf === 'ALL' ? 20000 : 1000,
        }),
        getClimateSeriesByUf({
          uf: ufParam,
          start: range.startDate,
          end: range.endDate,
          variavel: 'precipitacao',
          perUf: perUfBrasil,
          limit: uf === 'ALL' ? 20000 : 1000,
        }),
      ]);
      const buckets = new Map<string, { temps: number[]; hums: number[]; winds: number[]; precs: number[] }>();
      const ensure = (stateUf: string) => {
        if (!buckets.has(stateUf)) buckets.set(stateUf, { temps: [], hums: [], winds: [], precs: [] });
        return buckets.get(stateUf)!;
      };
      for (const row of temp.serieTemporal) {
        const value = toNum(row.value);
        const rowUf = String(row.uf || '').toUpperCase();
        if (!rowUf || value == null) continue;
        ensure(rowUf).temps.push(value);
      }
      for (const row of hum.serieTemporal) {
        const value = toNum(row.value);
        const rowUf = String(row.uf || '').toUpperCase();
        if (!rowUf || value == null) continue;
        ensure(rowUf).hums.push(value);
      }
      for (const row of wind.serieTemporal) {
        const value = toNum(row.value);
        const rowUf = String(row.uf || '').toUpperCase();
        if (!rowUf || value == null) continue;
        ensure(rowUf).winds.push(value);
      }
      for (const row of precip.serieTemporal) {
        const value = toNum(row.value);
        const rowUf = String(row.uf || '').toUpperCase();
        if (!rowUf || value == null) continue;
        ensure(rowUf).precs.push(value);
      }

      const periodRows: PeriodStateRow[] = [...buckets.entries()].map(([rowUf, b]) => {
        const t = avg(b.temps);
        const h = avg(b.hums);
        const w = avg(b.winds);
        const p = b.precs.length ? b.precs.reduce((a, x) => a + x, 0) : null;
        return {
          uf: rowUf,
          estado: formatUfLabel(rowUf),
          temperatura: t != null ? `${t.toFixed(1)}°C` : '—',
          temperaturaNum: t,
          umidade: h != null ? `${h.toFixed(1)}%` : '—',
          umidadeNum: h,
          vento: w != null ? `${w.toFixed(1)} km/h` : '—',
          ventoNum: w,
          precipitacao: p != null ? `${p.toFixed(1)}mm` : '—',
          precipitacaoNum: p,
          produtividade: '—',
          produtividadeNum: null,
          alertas: 0,
        };
      });
      return {
        periodRows,
        mapRevision: Date.now(),
      };
    },
    [periodo, uf]
  );

  const selectedStateRow = useMemo(() => {
    const rows = data?.periodRows ?? [];
    if (uf === 'ALL' || !/^[A-Z]{2}$/.test(uf) || !rows.length) return null;
    return rows.find((r) => r.uf === uf) || null;
  }, [data?.periodRows, uf]);

  const valuesByUf = useMemo(() => {
    const periodRows = data?.periodRows ?? [];
    if (!periodRows.length) return undefined;
    if (selectedStateRow) {
      const valueByMetric: Record<BrazilMapMetric, number | null | undefined> = {
        temperatura: selectedStateRow.temperaturaNum,
        umidade: selectedStateRow.umidadeNum,
        precipitacao: selectedStateRow.precipitacaoNum,
        vento: selectedStateRow.ventoNum,
        produtividade: selectedStateRow.produtividadeNum,
      };
      const v = valueByMetric[metric];
      if (v != null && !Number.isNaN(Number(v))) {
        return { [selectedStateRow.uf]: Number(v) };
      }
    }
    const out: Partial<Record<string, number>> = {};
    for (const row of periodRows) {
      const valueByMetric: Record<BrazilMapMetric, number | null | undefined> = {
        temperatura: row.temperaturaNum,
        umidade: row.umidadeNum,
        precipitacao: row.precipitacaoNum,
        vento: row.ventoNum,
        produtividade: row.produtividadeNum,
      };
      const value = valueByMetric[metric];
      if (value != null && !Number.isNaN(Number(value))) out[row.uf] = Number(value);
    }
    return out;
  }, [data?.periodRows, selectedStateRow, metric]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Mapa Climático
        </h1>
        <p className="text-muted-foreground">
          Visualização geoespacial de dados climáticos por estado (UF).
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
            <Card className="lg:col-span-1 self-start">
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <Select
                  label="UF"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  options={ufOptions}
                />
                <Select label="Métrica" value={metric} onChange={(e) => setMetric(e.target.value as BrazilMapMetric)} options={MAP_METRIC_OPTIONS} />
                <Select label="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value)} options={CLIMATE_PERIOD_OPTIONS} />
                <div className="pt-4 border-t border-border">
                  <MapMetricLegend metric={metric} />
                </div>
              </CardBody>
            </Card>

            <div className="lg:col-span-3 space-y-4">
              <Card className="relative">
                <CardBody className="p-0">
                  <BrazilMap metric={metric} valuesByUf={valuesByUf} dataRevision={payload.mapRevision} />
                </CardBody>
              </Card>

              {payload.periodRows.length === 0 && (
                <Card>
                  <CardBody>
                    <EmptyState
                      icon={MapPin}
                      title="Sem dados climáticos para o filtro"
                      description="Não há registros para o período ou UF selecionados. Ajuste os filtros à esquerda e tente novamente."
                    />
                  </CardBody>
                </Card>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>
                  Mapa estadual: agregação por UF no período selecionado (temperatura, umidade e vento por média; precipitação por acumulado).
                </span>
              </div>

              {selectedStateRow && (
                <Card>
                  <CardHeader>
                    <CardTitle>Leitura da UF selecionada</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">UF</p>
                        <p>{selectedStateRow.estado}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Temperatura</p>
                        <p>{selectedStateRow.temperatura}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Umidade</p>
                        <p>{selectedStateRow.umidade ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Precipitação</p>
                        <p>{selectedStateRow.precipitacao}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vento</p>
                        <p>{selectedStateRow.vento ?? '—'}</p>
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
