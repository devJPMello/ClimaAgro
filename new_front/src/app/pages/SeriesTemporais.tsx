import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Bookmark, Calendar, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { LazyRender } from '../components/ui/LazyRender';
import { ChartSkeleton } from '../components/ui/PageSkeletons';
import {
  getClimateSeriesByUf,
} from '../../lib/api/climateApi';
import { useClimateUfs } from '../../lib/hooks/useClimateUfs';
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
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { STORAGE_KEYS } from '../../lib/storage/storageKeys';

type SavedQuery = {
  id: string;
  name: string;
  uf: string;
  cultura: string;
  startYear: string;
  endYear: string;
};

type ProdRow = { mes: string; produtividade: number | null; produtividadeNum?: number | null };
type ClimaRow = { mes: string; temperatura: number; precipitacao: number; umidade: number };
type CompRow = { mes: string; clima: number; produtividade: number };

const MAX_CONCURRENT = 6;

/** Executa `fn` sobre cada item com no máximo `concurrency` promises simultâneas. */
async function concurrentMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

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
    if (!/^\d{4}-\d{2}$/.test(key)) {
      // Dado anual (IBGE/CONAB) sem mês: distribui o valor por todos os meses do ano
      const yr = String(r.year || '').trim();
      if (/^\d{4}$/.test(yr)) {
        for (let m = 1; m <= 12; m++) {
          const ym = `${yr}-${String(m).padStart(2, '0')}`;
          if (!map.has(ym)) map.set(ym, []);
          map.get(ym)!.push(p);
        }
      }
      continue;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return buildYearMonthKeysRange(startYear, endYear).map((ym) => {
    const vals = map.get(ym) || [];
    if (!vals.length) {
      return { mes: mesLabelFromYm(ym), produtividade: null, produtividadeNum: null };
    }
    const avg = Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100;
    return { mes: mesLabelFromYm(ym), produtividade: avg, produtividadeNum: avg };
  });
}

/** Converte rótulo "Jan/20" → "2020". */
function yearFromMesLabel(mes: string): string {
  const yy = mes.split('/')[1]?.trim();
  if (!yy) return mes;
  const n = parseInt(yy, 10);
  return String(n < 50 ? 2000 + n : 1900 + n);
}

const UF_ALL_OPTION = { value: 'ALL', label: 'Todos os estados' };

const CULTURA_FALLBACK_OPTIONS = [
  { value: '', label: 'Selecione uma cultura' },
];

function isUfValid(uf: string): boolean {
  return uf === 'ALL' || /^[A-Z]{2}$/.test(uf);
}

export function SeriesTemporais() {
  const [uf, setUf] = useState('');
  const [ufOptions, setUfOptions] = useState<Array<{ value: string; label: string }>>([UF_SELECT_PLACEHOLDER_OPTION]);
  const profileUf = useProfileUf();
  const { ufs: climateUfs } = useClimateUfs();

  useEffect(() => {
    if (uf !== '') return; // usuário já escolheu algo
    if (profileUf && ufOptions.some((o) => o.value === profileUf)) {
      setUf(profileUf);
    } else if (ufOptions.length > 1) {
      setUf('ALL'); // padrão quando sem perfil
    }
  }, [profileUf, ufOptions]);

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
  const [savedQueries, setSavedQueries] = usePersistedState<SavedQuery[]>(STORAGE_KEYS.SERIES_SAVED_QUERIES, []);
  const [loadedQueryId, setLoadedQueryId] = useState('');
  const [savingName, setSavingName] = useState<string | null>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savingName !== null) saveInputRef.current?.focus();
  }, [savingName]);

  function handleLoadQuery(id: string) {
    const q = savedQueries.find((item) => item.id === id);
    if (!q) { setLoadedQueryId(''); return; }
    setUf(q.uf);
    setCultura(q.cultura);
    setStartYear(q.startYear);
    setEndYear(q.endYear);
    setLoadedQueryId(id);
  }

  function handleSaveQuery() {
    const name = savingName?.trim();
    if (!name) return;
    const id = String(Date.now());
    setSavedQueries((prev) => [...prev, { id, name, uf, cultura, startYear, endYear }]);
    setLoadedQueryId(id);
    setSavingName(null);
  }

  function handleDeleteQuery(id: string) {
    setSavedQueries((prev) => prev.filter((q) => q.id !== id));
    if (loadedQueryId === id) setLoadedQueryId('');
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (uf === 'ALL' || !/^[A-Z]{2}$/.test(uf)) {
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
      } catch { /* mantém fallback estático */ }
    })();
    return () => { cancelled = true; };
  }, [uf]);

  useEffect(() => {
    if (!climateUfs.length) return;
    const onlyUfs = climateUfs
      .filter((x) => /^[A-Z]{2}$/.test(String(x.value || '').trim().toUpperCase()))
      .map((x) => {
        const value = String(x.value || '').trim().toUpperCase();
        return { value, label: formatUfLabel(value) };
      });
    if (onlyUfs.length) {
      setUfOptions([UF_SELECT_PLACEHOLDER_OPTION, UF_ALL_OPTION, ...onlyUfs]);
      if (uf && uf !== 'ALL' && !onlyUfs.some((x) => x.value === uf)) setUf('');
    }
  }, [climateUfs]);

  async function loadSeriesVariable(variavel: ClimateSeriesVariable) {
    if (!isUfValid(uf)) {
      throw new Error('Selecione uma UF ou "Todos os estados" para consultar a série temporal.');
    }
    const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
    const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
    return getClimateSeriesByUf({ uf, start: `${ys}-01-01`, end: `${ye}-12-31`, variavel, limit: uf === 'ALL' ? 20000 : 1000, offset: 0 });
  }

  const carregar = useCallback(async () => {
    if (!isUfValid(uf)) {
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
          if (!/^[A-Z]{2}$/.test(uf) || !cultura) return [];
          const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
          const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));
          const years = Array.from({ length: ye - ys + 1 }, (_, idx) => String(ys + idx));
          const responses = await concurrentMap(years, MAX_CONCURRENT, (year) =>
            listProductivityRecords({ state: uf, productLabel: cultura, year, limit: 500 }),
          );
          return responses.flatMap((r) => (r.success && Array.isArray(r.data) ? r.data : []));
        })(),
      ]);

      let climateMonthly = aggregateClimateByMonth(tempSeries, precipSeries, humSeries, startYear, endYear);

      if (/^[A-Z]{2}$/.test(uf)) {
        const allYmKeys = buildYearMonthKeysRange(startYear, endYear);
        const ys = Math.min(parseInt(startYear, 10), parseInt(endYear, 10));
        const ye = Math.max(parseInt(startYear, 10), parseInt(endYear, 10));

        // Verifica cobertura por ano (quantos meses têm dado real no banco)
        const yearCoverage = new Map<string, number>();
        for (let i = 0; i < allYmKeys.length; i++) {
          const year = allYmKeys[i].slice(0, 4);
          const row = climateMonthly[i];
          const hasData = row.temperatura !== 0 || row.umidade !== 0 || row.precipitacao !== 0;
          yearCoverage.set(year, (yearCoverage.get(year) ?? 0) + (hasData ? 1 : 0));
        }

        // Busca open-meteo apenas para os anos sem dados suficientes no banco
        const yearsNeedingFallback = Array.from({ length: ye - ys + 1 }, (_, i) => String(ys + i))
          .filter((y) => (yearCoverage.get(y) ?? 0) < 3);

        if (yearsNeedingFallback.length > 0) {
          const fallbackResponses = await concurrentMap(
            yearsNeedingFallback, MAX_CONCURRENT,
            (y) => getClimateVsProductivity({ state: uf, cropType: undefined, season: seasonFromYear(y) }),
          );
          const openMeteoByYm = new Map<string, { t: number[]; h: number[]; p: number[] }>();
          for (const fallback of fallbackResponses) {
            if (!(fallback.success && Array.isArray(fallback.data) && fallback.data.length)) continue;
            for (const row of fallback.data) {
              const ym = String(row.month || '').trim();
              if (!/^\d{4}-\d{2}$/.test(ym)) continue;
              if (!openMeteoByYm.has(ym)) openMeteoByYm.set(ym, { t: [], h: [], p: [] });
              const b = openMeteoByYm.get(ym)!;
              const t = Number(row.avgTemperature ?? NaN);
              const h = Number(row.avgHumidity ?? NaN);
              const p = Number(row.climate ?? NaN);
              if (Number.isFinite(t)) b.t.push(t);
              if (Number.isFinite(h)) b.h.push(h);
              if (Number.isFinite(p)) b.p.push(p);
            }
          }
          // Substitui apenas os meses dos anos que precisavam de fallback
          for (let i = 0; i < allYmKeys.length; i++) {
            const ym = allYmKeys[i];
            if (!yearsNeedingFallback.includes(ym.slice(0, 4))) continue;
            const it = openMeteoByYm.get(ym);
            if (!it) continue;
            const avg = (arr: number[]) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0);
            climateMonthly[i] = {
              mes: mesLabelFromYm(ym),
              temperatura: Math.round(avg(it.t) * 10) / 10,
              umidade: Math.round(avg(it.h) * 10) / 10,
              precipitacao: Math.round(avg(it.p) * 10) / 10,
            };
          }
        }
      }

      setDadosClimaticos(climateMonthly);
      const prodMonthly = aggregateProductivityByMonthYear(pRows, startYear, endYear);
      setDadosProdutividade(prodMonthly);
      const prodByMes = new Map(prodMonthly.map((r) => [r.mes, r.produtividadeNum ?? r.produtividade ?? null]));
      setDadosComparativos(
        climateMonthly
          .map((row) => ({ mes: row.mes, clima: row.precipitacao, produtividade: Number(prodByMes.get(row.mes) ?? 0) }))
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

  const ufValid = isUfValid(uf);
  const ufIsAll = uf === 'ALL';

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

      {/* Filtros */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="UF" value={uf} onChange={(e) => setUf(e.target.value)} options={ufOptions} />
            <Select
              label="Cultura (produtividade)"
              value={cultura}
              onChange={(e) => setCultura(e.target.value)}
              options={culturaOptions}
              disabled={!ufValid || ufIsAll}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Ano inicial" value={startYear} onChange={(e) => setStartYear(e.target.value)} options={yearOptions} />
            <Select label="Ano final" value={endYear} onChange={(e) => setEndYear(e.target.value)} options={yearOptions} />
          </div>
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              O intervalo de anos filtra clima e produtividade para os gráficos abaixo.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void carregar()} loading={loading}>
              Atualizar gráficos
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-end gap-3">
            {savedQueries.length > 0 && (
              <div className="flex items-end gap-2 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <Select
                    label="Carregar análise salva"
                    value={loadedQueryId}
                    onChange={(e) => handleLoadQuery(e.target.value)}
                    options={[
                      { value: '', label: 'Selecionar...' },
                      ...savedQueries.map((q) => ({ value: q.id, label: q.name })),
                    ]}
                  />
                </div>
                {loadedQueryId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteQuery(loadedQueryId)}
                    className="mb-0.5 p-2.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-all"
                    title="Excluir esta análise salva"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {savingName !== null ? (
              <div className="flex items-center gap-2">
                <input
                  ref={saveInputRef}
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveQuery();
                    if (e.key === 'Escape') setSavingName(null);
                  }}
                  placeholder="Nome da análise..."
                  maxLength={60}
                  className="h-[42px] px-3 bg-input-background border border-border rounded-lg text-sm text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground w-52"
                />
                <Button variant="primary" onClick={handleSaveQuery} disabled={!savingName.trim()}>
                  Salvar
                </Button>
                <Button variant="ghost" onClick={() => setSavingName(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setSavingName('')}>
                <Bookmark className="w-4 h-4" />
                Salvar configuração
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtividade ao Longo do Tempo</CardTitle>
          <CardDescription>Média mensal de produtividade na UF/cultura para o intervalo selecionado</CardDescription>
        </CardHeader>
        <CardBody>
          {loading ? (
            <ChartSkeleton />
          ) : !ufValid ? (
            <EmptyState icon={Calendar} title="Escolha um estado" description="Selecione uma UF ou 'Todos os estados' acima para carregar a produtividade e os gráficos." />
          ) : ufIsAll && !loading ? (
            <EmptyState icon={Calendar} title="Produtividade por estado específico" description="Selecione um estado específico para visualizar a produtividade ao longo do tempo." />
          ) : !cultura && !loading ? (
            <EmptyState icon={Calendar} title="Escolha uma cultura" description="Selecione uma cultura acima: sem esse filtro, a média misturaria produtividade de todas as culturas (unidades e escalas diferentes) num único número sem sentido." />
          ) : dadosProdutividade.length === 0 && !loading ? (
            <EmptyState icon={Calendar} title="Sem dados de produtividade" description="Rode o seed ou sync no backend e verifique se existe produtividade para esta UF/cultura." />
          ) : (
            <LazyRender height={300}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosProdutividade}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }} labelStyle={TOOLTIP_DATE_LABEL_STYLE} formatter={formatTooltipProdutividade} />
                  <Legend />
                  <Line type="monotone" dataKey="produtividadeNum" stroke="#1976D2" strokeWidth={3} dot={{ fill: '#1976D2', r: 5 }} activeDot={{ r: 7 }} connectNulls name="Produtividade (t/ha)" />
                </LineChart>
              </ResponsiveContainer>
            </LazyRender>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variáveis Climáticas</CardTitle>
          <CardDescription>Série mensal de clima no intervalo selecionado</CardDescription>
        </CardHeader>
        <CardBody>
          {loading ? (
            <ChartSkeleton />
          ) : !ufValid ? (
            <EmptyState icon={Calendar} title="Escolha um estado" description="Selecione uma UF ou 'Todos os estados' acima para carregar a série climática." />
          ) : dadosClimaticos.length === 0 && !loading ? (
            <EmptyState icon={Calendar} title="Sem dados climáticos no período" description="Sincronize dados (POST /api/climate/sync) ou importe medições para esta UF." />
          ) : (
            <LazyRender height={300}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosClimaticos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }} labelStyle={TOOLTIP_DATE_LABEL_STYLE} />
                  <Legend />
                  <Bar dataKey="temperatura" fill="#F97316" name="Temperatura (°C)" />
                  <Bar dataKey="precipitacao" fill="#42A5F5" name="Precipitação (mm)" />
                  <Bar dataKey="umidade" fill="#10B981" name="Umidade (%)" />
                </BarChart>
              </ResponsiveContainer>
            </LazyRender>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clima vs Produtividade</CardTitle>
          <CardDescription>Chuva mensal e produtividade mensal juntas para a UF/cultura/intervalo selecionados</CardDescription>
        </CardHeader>
        <CardBody>
          {loading ? (
            <ChartSkeleton />
          ) : !ufValid ? (
            <EmptyState icon={Calendar} title="Escolha um estado" description="Selecione uma UF ou 'Todos os estados' acima para comparar clima e produtividade." />
          ) : ufIsAll && !loading ? (
            <EmptyState icon={Calendar} title="Comparativo por estado específico" description="Selecione um estado específico para comparar clima e produtividade." />
          ) : !cultura && !loading ? (
            <EmptyState icon={Calendar} title="Escolha uma cultura" description="Selecione uma cultura acima: sem esse filtro, a produtividade comparada misturaria todas as culturas num único número sem sentido." />
          ) : dadosComparativos.length === 0 && !loading ? (
            <EmptyState icon={Calendar} title="Sem dados comparativos" description="Verifique se existem dados de clima e produtividade para esta UF, cultura e intervalo de anos." />
          ) : (
            <LazyRender height={300}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dadosComparativos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }} labelStyle={TOOLTIP_DATE_LABEL_STYLE} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="clima" stroke="#F97316" strokeWidth={2} dot={{ fill: '#F97316' }} name="Chuva acumulada (mm)" />
                  <Line yAxisId="right" type="monotone" dataKey="produtividade" stroke="#1976D2" strokeWidth={2} dot={{ fill: '#1976D2' }} name="Produtividade (t/ha)" />
                </LineChart>
              </ResponsiveContainer>
            </LazyRender>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
