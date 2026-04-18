import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { listAllClimateRecordsInRange, type ClimateListResponse } from '../../lib/api/climateApi';
import { listProductivityRecords, type ProductivityListResponse } from '../../lib/api/productivityApi';

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

function aggregateProductivityByYear(rows: ProductivityListResponse['data'], cropFilter: string): ProdRow[] {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (cropFilter && r.cropType && r.cropType !== cropFilter) continue;
    const p = num(r.productivity);
    if (p == null) continue;
    const y = r.year;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(p);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, vals]) => ({
      mes: String(year),
      produtividade: Math.round((vals.reduce((a, x) => a + x, 0) / vals.length) * 100) / 100,
    }));
}

function buildComparativo(
  climateRows: ClimateListResponse['data'],
  prodRows: ProductivityListResponse['data'],
  cropFilter: string
): CompRow[] {
  const tempByYear = new Map<number, number[]>();
  for (const r of climateRows) {
    const y = new Date(r.date).getFullYear();
    if (!Number.isFinite(y)) continue;
    const t = num(r.avgTemperature);
    if (t == null) continue;
    if (!tempByYear.has(y)) tempByYear.set(y, []);
    tempByYear.get(y)!.push(t);
  }
  const prodByYear = new Map<number, number[]>();
  for (const r of prodRows) {
    if (cropFilter && r.cropType && r.cropType !== cropFilter) continue;
    const p = num(r.productivity);
    if (p == null) continue;
    const y = r.year;
    if (!prodByYear.has(y)) prodByYear.set(y, []);
    prodByYear.get(y)!.push(p);
  }
  const years = new Set<number>([...tempByYear.keys(), ...prodByYear.keys()]);
  const out: CompRow[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    const ts = tempByYear.get(year);
    const ps = prodByYear.get(year);
    const clima = ts?.length ? ts.reduce((a, x) => a + x, 0) / ts.length : 0;
    const produtividade = ps?.length ? ps.reduce((a, x) => a + x, 0) / ps.length : 0;
    if (!ts?.length && !ps?.length) continue;
    out.push({
      mes: String(year),
      clima: Math.round(clima * 10) / 10,
      produtividade: Math.round(produtividade * 100) / 100,
    });
  }
  return out;
}

export function SeriesTemporais() {
  const [local, setLocal] = useState('palmas');
  const [cultura, setCultura] = useState('soja');
  const [dataInicio, setDataInicio] = useState('2025-01-01');
  const [dataFim, setDataFim] = useState('2026-04-16');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dadosProdutividade, setDadosProdutividade] = useState<ProdRow[]>([]);
  const [dadosClimaticos, setDadosClimaticos] = useState<ClimaRow[]>([]);
  const [dadosComparativos, setDadosComparativos] = useState<CompRow[]>([]);
  /** Explica por que o gráfico pode parecer “um ponto só”: agregação mensal vs diária. */
  const [climaSerieModo, setClimaSerieModo] = useState<'diaria' | 'mensal'>('mensal');

  const carregar = useCallback(async () => {
    const loc = LOCAL_SERIES[local];
    if (!loc) {
      setError('Local inválido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cRows, prodRes] = await Promise.all([
        listAllClimateRecordsInRange({
          state: loc.uf,
          place: loc.place,
          startDate: dataInicio,
          endDate: dataFim,
        }),
        listProductivityRecords({ state: loc.uf, cropType: cultura, limit: 100 }),
      ]);
      const pRows = prodRes.success ? prodRes.data : [];
      const spanDays = daysInclusive(dataInicio, dataFim);
      const useDaily = spanDays <= 120;
      setClimaSerieModo(useDaily ? 'diaria' : 'mensal');
      setDadosClimaticos(useDaily ? aggregateClimateDaily(cRows) : aggregateClimateMonthly(cRows));
      setDadosProdutividade(aggregateProductivityByYear(pRows, cultura));
      setDadosComparativos(buildComparativo(cRows, pRows, cultura));
    } catch (e) {
      setDadosClimaticos([]);
      setDadosProdutividade([]);
      setDadosComparativos([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar séries.');
    } finally {
      setLoading(false);
    }
  }, [local, cultura, dataInicio, dataFim]);

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
          Tocantins — clima por município e produtividade estadual
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Município (TO)"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              options={[
                { value: 'palmas', label: 'Palmas' },
                { value: 'araguaina', label: 'Araguaína' },
                { value: 'gurupi', label: 'Gurupi' },
                { value: 'porto-nacional', label: 'Porto Nacional' },
                { value: 'paraiso-to', label: 'Paraíso do Tocantins' },
                { value: 'guarai', label: 'Guaraí' },
              ]}
            />

            <Select
              label="Cultura (produtividade)"
              value={cultura}
              onChange={(e) => setCultura(e.target.value)}
              options={[
                { value: 'soja', label: 'Soja' },
                { value: 'milho', label: 'Milho' },
                { value: 'trigo', label: 'Trigo' },
              ]}
            />

            <Input
              label="Data Início"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />

            <Input
              label="Data Fim"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
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
          <CardDescription>Média anual por ano (dados em geo da UF e cultura)</CardDescription>
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
          <CardDescription>Temperatura média anual × produtividade média anual (quando houver ambos)</CardDescription>
        </CardHeader>
        <CardBody>
          {dadosComparativos.length === 0 && !loading ? (
            <EmptyState
              icon={Calendar}
              title="Sem dados comparativos"
              description="É necessário ter séries de clima e produtividade nos mesmos anos."
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
                  name="Temperatura média (°C)"
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
