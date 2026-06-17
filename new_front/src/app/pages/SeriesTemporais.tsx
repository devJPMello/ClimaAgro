import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getClimateSeriesByUf,
  listClimateUfs,
} from '../../lib/api/climateApi';
import {
  listProductivityProductLabels,
  listProductivityRecords,
  getClimateVsProductivity,
  type ProductivityListResponse,
} from '../../lib/api/productivityApi';
import { buildProductivityCropSelectOptions, getProductivityYearOptions } from '../../lib/filters/appFilters';
import type { ClimateSeriesVariable } from '../../lib/api/contracts/climate';
import { formatUfLabel, UF_SELECT_PLACEHOLDER_OPTION } from '../../lib/geo/brazilStatesMalha';
import { useProfileUf } from '../../lib/hooks/useProfileUf';

type ProdRow = { mes: string; produtividade: number | null; produtividadeNum?: number | null };
type ClimaRow = { mes: string; temperatura: number; precipitacao: number; umidade: number };
type CompRow = { mes: string; clima: number; produtividade: number };

/** Datas no eixo X e no cabeçalho do tooltip (tema escuro). */
const TOOLTIP_DATE_LABEL_STYLE = { color: '#000000' };

function formatTooltipProdutividade(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null || v === '') return 'Sem dado';
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} t/ha` : 'Sem dado';
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mesLabelFromYm(ym: string): string {
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  if (!y || !m) return ym;
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[m - 1]}/${String(y).slice(2)}`;
}

function seasonFromYear(year: string): string {
  const y = parseInt(year, 10);
  const next = (y + 1) % 100;
  return `${y}/${String(next).padStart(2, '0')}`;
}

function buildYearMonthKeys(year: string): string[] {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${String(idx + 1).padStart(2, '0')}`);
}

function buildYearMonthKeysRange(startYear: string, endYear: string): string[] {
  const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
  const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
  const out: string[] = [];
  for (let y = ys; y <= ye; y += 1) {
    out.push(...buildYearMonthKeys(String(y)));
  }
  return out;
}

function aggregateClimateByMonth(
  tempSeries: Awaited<ReturnType<typeof getClimateSeriesByUf>>,
  precipSeries: Awaited<ReturnType<typeof getClimateSeriesByUf>>,
  humSeries: Awaited<ReturnType<typeof getClimateSeriesByUf>>,
  startYear: string,
  endYear: string
): ClimaRow[] {
  const monthly = new Map<string, { temps: number[]; hums: number[]; precipSum: number }>();
  for (const ym of buildYearMonthKeysRange(startYear, endYear)) {
    monthly.set(ym, { temps: [], hums: [], precipSum: 0 });
  }

  for (const row of tempSeries.serieTemporal) {
    const ym = String(row.date || '').slice(0, 7);
    const v = num(row.value);
    if (!monthly.has(ym) || v == null) continue;
    monthly.get(ym)!.temps.push(v);
  }
  for (const row of humSeries.serieTemporal) {
    const ym = String(row.date || '').slice(0, 7);
    const v = num(row.value);
    if (!monthly.has(ym) || v == null) continue;
    monthly.get(ym)!.hums.push(v);
  }
  for (const row of precipSeries.serieTemporal) {
    const ym = String(row.date || '').slice(0, 7);
    const v = num(row.value);
    if (!monthly.has(ym) || v == null) continue;
    monthly.get(ym)!.precipSum += v;
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0);
  return buildYearMonthKeysRange(startYear, endYear).map((ym) => {
    const b = monthly.get(ym)!;
    return {
      mes: mesLabelFromYm(ym),
      temperatura: Math.round(avg(b.temps) * 10) / 10,
      precipitacao: Math.round(b.precipSum * 10) / 10,
      umidade: Math.round(avg(b.hums) * 10) / 10,
    };
  });
}

/** Agrupa por mês-ano (`periodRef`) no formato `YYYY-MM`. */
function aggregateProductivityByMonthYear(
  rows: ProductivityListResponse['data'],
  startYear: string,
  endYear: string
): ProdRow[] {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const p = num(r.productivity);
    if (p == null) continue;
    const key = String(r.periodRef || '').trim();
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return buildYearMonthKeysRange(startYear, endYear).map((ym) => {
    const vals = map.get(ym) || [];
    if (!vals.length) {
      return {
        mes: mesLabelFromYm(ym),
        produtividade: null,
        produtividadeNum: null,
      };
    }
    const avg = Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100;
    return {
      mes: mesLabelFromYm(ym),
      produtividade: avg,
      produtividadeNum: avg,
    };
  });
}

const CULTURA_FALLBACK_OPTIONS = [
  { value: '', label: 'Selecione uma cultura' },
];

export function SeriesTemporais() {
  const [uf, setUf] = useState('');
  const [ufOptions, setUfOptions] = useState<Array<{ value: string; label: string }>>([UF_SELECT_PLACEHOLDER_OPTION]);
  const profileUf = useProfileUf();

  useEffect(() => {
    if (profileUf && uf === '' && ufOptions.length > 1) {
      if (ufOptions.some((o) => o.value === profileUf)) setUf(profileUf);
    }
  }, [profileUf, ufOptions, uf]);
  const yearOptions = useMemo(() => getProductivityYearOptions(), []);
  const [cultura, setCultura] = useState('');
  const [culturaOptions, setCulturaOptions] =
    useState<Array<{ value: string; label: string }>>(CULTURA_FALLBACK_OPTIONS);
  const [startYear, setStartYear] = useState(yearOptions[Math.min(2, yearOptions.length - 1)]?.value ?? String(new Date().getFullYear() - 2));
  const [endYear, setEndYear] = useState(yearOptions[0]?.value ?? String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dadosProdutividade, setDadosProdutividade] = useState<ProdRow[]>([]);
  const [dadosClimaticos, setDadosClimaticos] = useState<ClimaRow[]>([]);
  const [dadosComparativos, setDadosComparativos] = useState<CompRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!/^[A-Z]{2}$/.test(uf)) {
        setCulturaOptions(CULTURA_FALLBACK_OPTIONS);
        setCultura('');
        return;
      }
      try {
        const res = await listProductivityProductLabels({ state: uf });
        if (cancelled || !res.success || !res.data?.length) return;
        const opts = buildProductivityCropSelectOptions(res.data);
        setCulturaOptions(opts);
        setCultura((c) =>
          opts.some((o) => o.value === c)
            ? c
            : opts.find((o) => o.value === '')?.value ?? opts[0]?.value ?? ''
        );
      } catch {
        /* mantém fallback estático */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uf]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listClimateUfs();
        if (!cancelled && data.length) {
          const onlyUfs = data
            .filter((x) => /^[A-Z]{2}$/.test(String(x.value || '').trim().toUpperCase()))
            .map((x) => {
              const value = String(x.value || '').trim().toUpperCase();
              return { value, label: formatUfLabel(value) };
            });
          if (onlyUfs.length) {
            setUfOptions([UF_SELECT_PLACEHOLDER_OPTION, ...onlyUfs]);
            if (uf && !onlyUfs.some((x) => x.value === uf)) {
              setUf('');
            }
          }
        }
      } catch {
        /* fallback em memória */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSeriesVariable(variavel: ClimateSeriesVariable) {
    if (!/^[A-Z]{2}$/.test(uf)) {
      throw new Error('Selecione uma UF válida para consultar a série temporal.');
    }
    const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
    const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
    const start = `${ys}-01-01`;
    const end = `${ye}-12-31`;
    return getClimateSeriesByUf({
      uf,
      start,
      end,
      variavel,
      limit: 1000,
      offset: 0,
    });
  }

  const carregar = useCallback(async () => {
    if (!/^[A-Z]{2}$/.test(uf)) {
      setDadosClimaticos([]);
      setDadosProdutividade([]);
      setDadosComparativos([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tempSeries, precipSeries, humSeries, pRows] = await Promise.all([
        loadSeriesVariable('temperatura_media'),
        loadSeriesVariable('precipitacao'),
        loadSeriesVariable('umidade'),
        (async (): Promise<ProductivityListResponse['data']> => {
          if (!/^[A-Z]{2}$/.test(uf)) return [];
          const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
          const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
          const years = Array.from({ length: ye - ys + 1 }, (_, idx) => String(ys + idx));
          const responses = await Promise.all(
            years.map((year) =>
              listProductivityRecords({
                state: uf,
                productLabel: cultura || undefined,
                year,
                limit: 500,
              })
            )
          );
          return responses.flatMap((prodRes) => (prodRes.success && Array.isArray(prodRes.data) ? prodRes.data : []));
        })(),
      ]);
      let climateMonthly = aggregateClimateByMonth(tempSeries, precipSeries, humSeries, startYear, endYear);
      const monthsWithAnyClimate = climateMonthly.filter(
        (m) => m.temperatura !== 0 || m.umidade !== 0 || m.precipitacao !== 0
      ).length;
      const shouldUseFallback = monthsWithAnyClimate < 3;
      if (shouldUseFallback && /^[A-Z]{2}$/.test(uf)) {
        const byMonth = new Map<string, { t: number[]; h: number[]; p: number[] }>();
        const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
        const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
        const targetUfs = [uf];

        const fallbackResponses = await Promise.all(
          targetUfs.flatMap((stateUf) =>
            Array.from({ length: ye - ys + 1 }, (_, idx) => String(ys + idx)).map((y) =>
              getClimateVsProductivity({
                state: stateUf,
                cropType: undefined,
                season: seasonFromYear(y),
              })
            )
          )
        );

        for (const fallback of fallbackResponses) {
          if (!(fallback.success && Array.isArray(fallback.data) && fallback.data.length)) continue;
          for (const row of fallback.data) {
            const ym = String(row.month || '').trim();
            if (!/^\d{4}-\d{2}$/.test(ym)) continue;
            if (!byMonth.has(ym)) byMonth.set(ym, { t: [], h: [], p: [] });
            const b = byMonth.get(ym)!;
            const t = Number(row.avgTemperature ?? NaN);
            const h = Number(row.avgHumidity ?? NaN);
            const p = Number(row.climate ?? NaN);
            if (Number.isFinite(t)) b.t.push(t);
            if (Number.isFinite(h)) b.h.push(h);
            if (Number.isFinite(p)) b.p.push(p);
          }
        }
        climateMonthly = buildYearMonthKeysRange(startYear, endYear).map((ym) => {
          const it = byMonth.get(ym);
          const avg = (arr?: number[]) => (arr && arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0);
          return {
            mes: mesLabelFromYm(ym),
            temperatura: Math.round(avg(it?.t) * 10) / 10,
            umidade: Math.round(avg(it?.h) * 10) / 10,
            precipitacao: Math.round(avg(it?.p) * 10) / 10,
          };
        });
      }
      setDadosClimaticos(climateMonthly);

      const prodMonthly = aggregateProductivityByMonthYear(pRows, startYear, endYear);
      setDadosProdutividade(prodMonthly);

      const prodByMes = new Map(prodMonthly.map((r) => [r.mes, r.produtividadeNum ?? r.produtividade ?? null]));
      setDadosComparativos(
        climateMonthly
          .map((row) => ({
            mes: row.mes,
            clima: row.precipitacao,
            produtividade: Number(prodByMes.get(row.mes) ?? 0),
          }))
          .filter((row) => row.clima > 0 || row.produtividade > 0)
      );
    } catch (e) {
      setDadosClimaticos([]);
      setDadosProdutividade([]);
      setDadosComparativos([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar séries.');
    } finally {
      setLoading(false);
    }
  }, [cultura, startYear, endYear, uf]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ufValid = /^[A-Z]{2}$/.test(uf);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Séries Temporais
        </h1>
        <p className="text-muted-foreground">
          Série mensal por UF e ano, combinando clima e produtividade no mesmo recorte temporal.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="UF"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              options={ufOptions}
            />
            <Select
              label="Cultura (produtividade)"
              value={cultura}
              onChange={(e) => setCultura(e.target.value)}
              options={culturaOptions}
              disabled={!ufValid}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Ano inicial"
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              options={yearOptions}
            />
            <Select
              label="Ano final"
              value={endYear}
              onChange={(e) => setEndYear(e.target.value)}
              options={yearOptions}
            />
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-1 gap-4">
            <p className="text-sm text-muted-foreground self-end pb-2 md:col-span-1">
              O intervalo de anos filtra clima e produtividade para os gráficos abaixo.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void carregar()} loading={loading}>
              Atualizar gráficos
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtividade ao Longo do Tempo</CardTitle>
          <CardDescription>
            Média mensal de produtividade na UF/cultura para o intervalo selecionado
          </CardDescription>
        </CardHeader>
        <CardBody>
          {!ufValid && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Escolha um estado"
              description="Selecione uma UF acima para carregar a produtividade e os gráficos."
            />
          ) : dadosProdutividade.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Sem dados de produtividade"
              description="Rode o seed ou sync no backend e verifique se existe produtividade para esta UF/cultura."
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosProdutividade}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                  labelStyle={TOOLTIP_DATE_LABEL_STYLE}
                  formatter={formatTooltipProdutividade}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="produtividadeNum"
                  stroke="#1976D2"
                  strokeWidth={3}
                  dot={{ fill: '#1976D2', r: 5 }}
                  activeDot={{ r: 7 }}
                  connectNulls
                  name="Produtividade (t/ha)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variáveis Climáticas</CardTitle>
          <CardDescription>
            Série mensal de clima no intervalo selecionado
          </CardDescription>
        </CardHeader>
        <CardBody>
          {!ufValid && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Escolha um estado"
              description="Selecione uma UF acima para carregar a série climática."
            />
          ) : dadosClimaticos.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Sem dados climáticos no período"
              description="Sincronize dados (POST /api/climate/sync) ou importe medições para esta UF."
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosClimaticos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                  labelStyle={TOOLTIP_DATE_LABEL_STYLE}
                />
                <Legend />
                <Bar dataKey="temperatura" fill="#F97316" name="Temperatura (°C)" />
                <Bar dataKey="precipitacao" fill="#42A5F5" name="Precipitação (mm)" />
                <Bar dataKey="umidade" fill="#10B981" name="Umidade (%)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clima vs Produtividade</CardTitle>
          <CardDescription>
            Chuva mensal e produtividade mensal juntas para a UF/cultura/intervalo selecionados
          </CardDescription>
        </CardHeader>
        <CardBody>
          {!ufValid && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Escolha um estado"
              description="Selecione uma UF acima para comparar clima e produtividade."
            />
          ) : dadosComparativos.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Sem dados comparativos"
              description="Verifique se existem dados de clima e produtividade para esta UF, cultura e intervalo de anos."
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosComparativos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                  labelStyle={TOOLTIP_DATE_LABEL_STYLE}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="clima"
                  stroke="#F97316"
                  strokeWidth={2}
                  dot={{ fill: '#F97316' }}
                  name="Chuva acumulada (mm)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="produtividade"
                  stroke="#1976D2"
                  strokeWidth={2}
                  dot={{ fill: '#1976D2' }}
                  name="Produtividade (t/ha)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

    </div>
  );
}
