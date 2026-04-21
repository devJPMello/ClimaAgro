import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { listAllClimateRecordsInRange, type ClimateListResponse } from '../../lib/api/climateApi';
import {
  getClimateVsProductivity,
  listAllProductivityRecords,
  listProductivityCropTypes,
  listProductivityRecords,
  type ProductivityListResponse,
} from '../../lib/api/productivityApi';
import { getProductivitySeasonOptions, labelForProductivityCropType } from '../../lib/filters/appFilters';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';

type ProdRow = { mes: string; produtividade: number };
type ClimaRow = { mes: string; temperatura: number; precipitacao: number; umidade: number };
type CompRow = { mes: string; clima: number; produtividade: number };

/** Municípios do Tocantins — `place` deve coincidir com geo_data.name (seed). */
const LOCAL_SERIES: Record<string, { place: string; uf: string }> = {
  palmas: { place: 'Palmas', uf: 'TO' },
  araguaina: { place: 'Araguaína', uf: 'TO' },
  gurupi: { place: 'Gurupi', uf: 'TO' },
  'porto-nacional': { place: 'Porto Nacional', uf: 'TO' },
  'paraiso-to': { place: 'Paraíso do Tocantins', uf: 'TO' },
  guarai: { place: 'Guaraí', uf: 'TO' },
};

/** Nome oficial do município (ou chave legada do mapa) → `{ place, uf }` para a API de clima. */
function resolveSeriesPlace(localKey: string): { place: string; uf: string } | null {
  const mapped = LOCAL_SERIES[localKey];
  if (mapped) return mapped;
  const trimmed = localKey.trim();
  if (!trimmed) return null;
  return { place: trimmed, uf: 'TO' };
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

/** Quantidade de dias no intervalo inclusivo (datas `YYYY-MM-DD`). */
function daysInclusive(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 9999;
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / 86_400_000) + 1;
}

function dayKeyFromRowDate(dateRaw: string | undefined): string | null {
  if (!dateRaw) return null;
  const d = String(dateRaw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function labelFromDayKey(day: string): string {
  const [y, m, dayNum] = day.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !dayNum) return day;
  return `${String(dayNum).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(y).slice(2)}`;
}

/** Uma barra por dia (quando o intervalo é curto). */
function aggregateClimateDaily(rows: ClimateListResponse['data']): ClimaRow[] {
  const map = new Map<string, { temps: number[]; precs: number[]; hums: number[] }>();
  for (const r of rows) {
    const day = dayKeyFromRowDate(r.date);
    if (!day) continue;
    if (!map.has(day)) map.set(day, { temps: [], precs: [], hums: [] });
    const b = map.get(day)!;
    const t = num(r.avgTemperature);
    if (t != null) b.temps.push(t);
    const p = num(r.precipitation);
    if (p != null) b.precs.push(p);
    const h = num(r.humidity);
    if (h != null) b.hums.push(h);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0);
  const keys = [...map.keys()].sort();
  return keys.map((day) => {
    const b = map.get(day)!;
    return {
      mes: labelFromDayKey(day),
      temperatura: Math.round(avg(b.temps) * 10) / 10,
      precipitacao: Math.round(avg(b.precs) * 10) / 10,
      umidade: Math.round(avg(b.hums) * 10) / 10,
    };
  });
}

function aggregateClimateMonthly(rows: ClimateListResponse['data']): ClimaRow[] {
  const map = new Map<string, { temps: number[]; precs: number[]; hums: number[] }>();
  for (const r of rows) {
    const ym = (r.date || '').slice(0, 7);
    if (ym.length < 7) continue;
    if (!map.has(ym)) map.set(ym, { temps: [], precs: [], hums: [] });
    const b = map.get(ym)!;
    const t = num(r.avgTemperature);
    if (t != null) b.temps.push(t);
    const p = num(r.precipitation);
    if (p != null) b.precs.push(p);
    const h = num(r.humidity);
    if (h != null) b.hums.push(h);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0);
  const keys = [...map.keys()].sort();
  return keys.map((ym) => {
    const b = map.get(ym)!;
    return {
      mes: mesLabelFromYm(ym),
      temperatura: Math.round(avg(b.temps) * 10) / 10,
      precipitacao: Math.round(avg(b.precs) * 10) / 10,
      umidade: Math.round(avg(b.hums) * 10) / 10,
    };
  });
}

/** Ordena safras tipo `2023/24`, `2024/25`. */
function compareSafras(a: string, b: string): number {
  const startYear = (s: string) => {
    const m = /^(\d{4})\//.exec(String(s).trim());
    return m ? parseInt(m[1], 10) : 0;
  };
  return startYear(a) - startYear(b) || a.localeCompare(b, 'pt-BR');
}

function normalizeSeasonForApi(raw: string): string {
  const season = String(raw || '').trim();
  if (/^\d{2}\/\d{2}$/.test(season)) return `20${season}`;
  return season;
}

/** Agrupa por safra SIDRA (`season`); fallback: ano agrícola. */
function aggregateProductivityBySeason(rows: ProductivityListResponse['data'], cropFilter: string): ProdRow[] {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    if (cropFilter && r.cropType && r.cropType !== cropFilter) continue;
    const p = num(r.productivity);
    if (p == null) continue;
    const key = (r.season && String(r.season).trim()) || String(r.year);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()]
    .sort((a, b) => compareSafras(a[0], b[0]))
    .map(([k, vals]) => ({
      mes: k,
      produtividade: Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100,
    }));
}

const CULTURA_FALLBACK_OPTIONS = [
  { value: 'soja', label: 'Soja' },
  { value: 'milho', label: 'Milho' },
  { value: 'trigo', label: 'Trigo' },
];

export function SeriesTemporais() {
  const seasonOptions = useMemo(() => getProductivitySeasonOptions(), []);
  const [local, setLocal] = useState('Palmas');
  const [cultura, setCultura] = useState('soja');
  const [culturaOptions, setCulturaOptions] =
    useState<Array<{ value: string; label: string }>>(CULTURA_FALLBACK_OPTIONS);
  /** Intervalo de calendário só para a API de clima (registos diários). */
  const [dataInicioClima, setDataInicioClima] = useState('2026-01-01');
  const [dataFimClima, setDataFimClima] = useState('2026-04-16');
  /** Safra selecionada para cruzar clima histórico e produtividade. */
  const [selectedSeason, setSelectedSeason] = useState('24/25');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dadosProdutividade, setDadosProdutividade] = useState<ProdRow[]>([]);
  const [dadosClimaticos, setDadosClimaticos] = useState<ClimaRow[]>([]);
  const [dadosComparativos, setDadosComparativos] = useState<CompRow[]>([]);
  /** Explica por que o gráfico pode parecer “um ponto só”: agregação mensal vs diária. */
  const [climaSerieModo, setClimaSerieModo] = useState<'diaria' | 'mensal'>('mensal');

  const { options: municipioSelectOptions, loading: municipiosLoading, error: municipiosError } =
    useIbgeMunicipioSelectOptions();

  useEffect(() => {
    if (!municipioSelectOptions.length) return;
    const valid = new Set(municipioSelectOptions.map((o) => o.value));
    if (valid.has(local)) return;
    const mapped = LOCAL_SERIES[local];
    if (mapped && valid.has(mapped.place)) {
      setLocal(mapped.place);
      return;
    }
    if (valid.has('Palmas')) setLocal('Palmas');
  }, [municipioSelectOptions, local]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listProductivityCropTypes({ state: 'TO' });
        if (cancelled || !res.success || !res.data?.length) return;
        const uniq = [...new Set(res.data.map((x) => String(x || '').trim()).filter(Boolean))];
        if (!uniq.length) return;
        uniq.sort((a, b) =>
          labelForProductivityCropType(a).localeCompare(labelForProductivityCropType(b), 'pt-BR')
        );
        const opts = uniq.map((v) => ({ value: v, label: labelForProductivityCropType(v) }));
        setCulturaOptions(opts);
        setCultura((c) =>
          opts.some((o) => o.value === c)
            ? c
            : opts.find((o) => o.value === 'soja')?.value ?? opts[0]?.value ?? 'soja'
        );
      } catch {
        /* mantém fallback estático */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const carregar = useCallback(async () => {
    const loc = resolveSeriesPlace(local);
    if (!loc) {
      setError('Município inválido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const selectedSeasonTrim = selectedSeason.trim();
      const selectedSeasonApi = normalizeSeasonForApi(selectedSeasonTrim);
      const [cRows, pRows] = await Promise.all([
        listAllClimateRecordsInRange({
          state: loc.uf,
          place: loc.place,
          startDate: dataInicioClima,
          endDate: dataFimClima,
        }),
        (async (): Promise<ProductivityListResponse['data']> => {
          if (selectedSeasonApi) {
            const prodRes = await listProductivityRecords({
              state: loc.uf,
              cropType: cultura,
              municipality: loc.place,
              season: selectedSeasonApi,
              limit: 500,
            });
            return prodRes.success && Array.isArray(prodRes.data) ? prodRes.data : [];
          }
          return listAllProductivityRecords({
            state: loc.uf,
            cropType: cultura,
            municipality: loc.place,
          });
        })(),
      ]);
      const spanDays = daysInclusive(dataInicioClima, dataFimClima);
      const useDaily = spanDays <= 120;
      setClimaSerieModo(useDaily ? 'diaria' : 'mensal');
      setDadosClimaticos(useDaily ? aggregateClimateDaily(cRows) : aggregateClimateMonthly(cRows));
      setDadosProdutividade(aggregateProductivityBySeason(pRows, cultura));
      if (selectedSeasonApi) {
        const comparativoRes = await getClimateVsProductivity({
          state: loc.uf,
          municipality: loc.place,
          cropType: cultura,
          season: selectedSeasonTrim,
        });
        const comparativoData = comparativoRes.success && Array.isArray(comparativoRes.data)
          ? comparativoRes.data
          : [];
        setDadosComparativos(
          comparativoData
            .filter((row) => row.climate != null && row.productivity != null)
            .map((row) => ({
              mes: row.mes || row.month || row.season,
              clima: Number(row.climate),
              produtividade: Number(row.productivity),
            }))
        );
      } else {
        setDadosComparativos([]);
      }
    } catch (e) {
      setDadosClimaticos([]);
      setDadosProdutividade([]);
      setDadosComparativos([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar séries.');
    } finally {
      setLoading(false);
    }
  }, [local, cultura, dataInicioClima, dataFimClima, selectedSeason]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Séries Temporais
        </h1>
        <p className="text-muted-foreground">
          Tocantins — período de calendário para o clima; safra (SIDRA) para produtividade no município
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Município (TO)"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              options={municipioSelectOptions}
              disabled={municipiosLoading}
              error={municipiosError ?? undefined}
            />

            <Select
              label="Cultura (produtividade)"
              value={cultura}
              onChange={(e) => setCultura(e.target.value)}
              options={culturaOptions}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Clima — data início"
              type="date"
              value={dataInicioClima}
              onChange={(e) => setDataInicioClima(e.target.value)}
            />

            <Input
              label="Clima — data fim"
              type="date"
              value={dataFimClima}
              onChange={(e) => setDataFimClima(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Produtividade — safra (SIDRA)"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              options={seasonOptions.map(({ value, label }) => ({ value, label }))}
            />
            <p className="text-sm text-muted-foreground self-end pb-2 md:col-span-1">
              A safra selecionada atualiza automaticamente o gráfico de clima vs produtividade com o clima histórico do
              ano base da safra (ex.: 24/25 usa clima de 2024).
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
            Média por safra no município e cultura selecionados
            {selectedSeason.trim() ? ` (safra ${selectedSeason.trim()})` : ' (todas as safras com dados)'}
          </CardDescription>
        </CardHeader>
        <CardBody>
          {dadosProdutividade.length === 0 && !loading ? (
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
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="produtividade"
                  stroke="#1976D2"
                  strokeWidth={3}
                  dot={{ fill: '#1976D2', r: 5 }}
                  activeDot={{ r: 7 }}
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
            {climaSerieModo === 'diaria'
              ? 'Valores por dia (até 120 dias no filtro); períodos maiores usam média mensal.'
              : 'Médias mensais no período (vários dias no mesmo mês viram um único ponto por mês).'}
          </CardDescription>
        </CardHeader>
        <CardBody>
          {dadosClimaticos.length === 0 && !loading ? (
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
            Safra selecionada: chuva mensal do ano base da safra × produtividade média da mesma safra no município
          </CardDescription>
        </CardHeader>
        <CardBody>
          {dadosComparativos.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Sem dados comparativos"
              description="Selecione uma safra válida e verifique dados climáticos históricos e produtividade para a cultura escolhida."
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
