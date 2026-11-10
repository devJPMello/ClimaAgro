import { useEffect, useMemo, useState } from 'react';
import { Download, GitCompare } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { YearRangeNote } from '../components/ui/YearRangeNote';
import { getClimateSeriesByUf, getDashboardSummary } from '../../lib/api/climateApi';
import { listProductivityProductLabels, listProductivityRecords } from '../../lib/api/productivityApi';
import { useClimateUfs } from '../../lib/hooks/useClimateUfs';
import { useProfileUf } from '../../lib/hooks/useProfileUf';
import { useChartTheme } from '../../lib/charts/useChartTheme';
import { buildProductivityCropSelectOptions, getProductivityYearOptions } from '../../lib/filters/appFilters';
import { formatUfLabel } from '../../lib/geo/brazilStatesMalha';
import {
  MESES_ABREV,
  anosDoIntervalo,
  chuvaMensalMedia,
  media,
  produtividadePorAno,
  resumoParaCsv,
  type ResumoEstado,
} from '../../lib/comparador/compararEstados';

const CORES = ['#2563EB', '#F97316', '#16A34A', '#9333EA'];
const MAX_ESTADOS = 4;
const PAGINA_SERIE = 1000;

type Resultado = {
  ufs: string[];
  resumo: ResumoEstado[];
  chuva: Array<Record<string, string | number | null>>;
  produtividade: Array<Record<string, string | number | null>>;
};

async function chuvaDiaria(uf: string, inicio: number, fim: number) {
  const pontos: Array<{ date: string; value: number | null }> = [];
  for (let offset = 0; offset < 10 * PAGINA_SERIE; offset += PAGINA_SERIE) {
    const r = await getClimateSeriesByUf({
      uf,
      start: `${inicio}-01-01`,
      end: `${fim}-12-31`,
      variavel: 'precipitacao',
      limit: PAGINA_SERIE,
      offset,
    });
    pontos.push(...(r.serieTemporal ?? []));
    if ((r.serieTemporal?.length ?? 0) < PAGINA_SERIE) break;
  }
  return pontos;
}

async function carregarEstado(uf: string, cultura: string, anos: number[]) {
  const [resumo, serie, linhas] = await Promise.all([
    getDashboardSummary({ state: uf }),
    chuvaDiaria(uf, anos[0], anos[anos.length - 1]),
    Promise.all(
      anos.map((ano) => listProductivityRecords({ state: uf, productLabel: cultura, year: ano, limit: 500 }))
    ),
  ]);
  const regiao = resumo.regioes[0];
  const chuvaPorMes = chuvaMensalMedia(serie);
  const prodPorAno = produtividadePorAno(
    linhas.flatMap((l) => (l.success && Array.isArray(l.data) ? l.data : [])),
    anos
  );
  const linhaResumo: ResumoEstado = {
    uf,
    temperatura: regiao?.temperatura ?? '—',
    precipitacao: regiao?.precipitacao ?? '—',
    produtividadeUltimoAno: regiao?.produtividade ?? '—',
    alertas: regiao?.alertas ?? 0,
    produtividadeMediaPeriodo: media(Object.values(prodPorAno)),
    chuvaMensalMediaPeriodo: media(chuvaPorMes),
  };
  return { uf, linhaResumo, chuvaPorMes, prodPorAno };
}

export function ComparadorEstados() {
  const { ufs: ufsApi } = useClimateUfs();
  const profileUf = useProfileUf();
  const chart = useChartTheme();
  const yearOptions = useMemo(() => getProductivityYearOptions(), []);

  const [escolhidos, setEscolhidos] = useState<string[]>(['', '', '', '']);
  const [cultura, setCultura] = useState('');
  const [culturaOptions, setCulturaOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'Selecione uma cultura' },
  ]);
  const [anoInicio, setAnoInicio] = useState(yearOptions[yearOptions.length - 1]?.value ?? '2023');
  const [anoFim, setAnoFim] = useState(yearOptions[0]?.value ?? '2026');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const ufOptions = useMemo(
    () => [
      { value: '', label: 'Escolher um estado' },
      ...ufsApi
        .map((u) => String(u.value || '').trim().toUpperCase())
        .filter((v) => /^[A-Z]{2}$/.test(v))
        .map((v) => ({ value: v, label: formatUfLabel(v) })),
    ],
    [ufsApi]
  );

  useEffect(() => {
    if (profileUf) setEscolhidos((atual) => (atual[0] ? atual : [profileUf, ...atual.slice(1)]));
  }, [profileUf]);

  const selecionados = useMemo(() => [...new Set(escolhidos.filter(Boolean))], [escolhidos]);
  const ufBase = selecionados[0] ?? '';

  useEffect(() => {
    if (!ufBase) return;
    let cancelado = false;
    void listProductivityProductLabels({ state: ufBase })
      .then((res) => {
        if (cancelado || !res.success || !res.data?.length) return;
        const opts = buildProductivityCropSelectOptions(res.data);
        setCulturaOptions(opts);
        setCultura((c) => (opts.some((o) => o.value === c) ? c : opts.find((o) => /soja/i.test(o.label))?.value ?? ''));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [ufBase]);

  const podeComparar = selecionados.length >= 2 && Boolean(cultura) && !carregando;

  async function comparar() {
    setCarregando(true);
    setErro(null);
    try {
      const anos = anosDoIntervalo(anoInicio, anoFim);
      const dados = await Promise.all(selecionados.map((uf) => carregarEstado(uf, cultura, anos)));
      setResultado({
        ufs: selecionados,
        resumo: dados.map((d) => d.linhaResumo),
        chuva: MESES_ABREV.map((mes, i) => ({
          mes,
          ...Object.fromEntries(dados.map((d) => [d.uf, d.chuvaPorMes[i]])),
        })),
        produtividade: anos.map((ano) => ({
          ano: String(ano),
          ...Object.fromEntries(dados.map((d) => [d.uf, d.prodPorAno[String(ano)]])),
        })),
      });
    } catch (e) {
      setResultado(null);
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível carregar a comparação.');
    } finally {
      setCarregando(false);
    }
  }

  function baixarCsv() {
    if (!resultado) return;
    const blob = new Blob([String.fromCharCode(0xfeff) + resumoParaCsv(resultado.resumo)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `climaagro-comparacao-${resultado.ufs.join('-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Comparador de Estados
        </h1>
        <p className="text-muted-foreground">
          Compare de 2 a {MAX_ESTADOS} estados lado a lado: clima recente, alertas, produtividade e o regime de chuvas ao longo do ano.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escolha o que comparar</CardTitle>
          <CardDescription>Selecione os estados e a cultura; o período segue o intervalo coberto pela base.</CardDescription>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {escolhidos.map((valor, i) => (
              <Select
                key={i}
                label={`Estado ${i + 1}${i < 2 ? '' : ' (opcional)'}`}
                value={valor}
                options={ufOptions}
                onChange={(e) => setEscolhidos((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Cultura (produtividade)"
              value={cultura}
              options={culturaOptions}
              onChange={(e) => setCultura(e.target.value)}
              disabled={!ufBase}
            />
            <Select label="Ano inicial" value={anoInicio} options={yearOptions} onChange={(e) => setAnoInicio(e.target.value)} />
            <Select label="Ano final" value={anoFim} options={yearOptions} onChange={(e) => setAnoFim(e.target.value)} />
          </div>
          <YearRangeNote />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void comparar()} loading={carregando} disabled={!podeComparar}>
              <GitCompare className="h-4 w-4" />
              Comparar
            </Button>
            {resultado && (
              <Button type="button" variant="secondary" onClick={baixarCsv}>
                <Download className="h-4 w-4" />
                Baixar CSV
              </Button>
            )}
            {selecionados.length < 2 && (
              <span className="text-xs text-muted-foreground">Escolha pelo menos dois estados diferentes.</span>
            )}
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </CardBody>
      </Card>

      {!resultado && !carregando && (
        <Card>
          <CardBody>
            <EmptyState
              icon={GitCompare}
              title="Nenhuma comparação ainda"
              description="Escolha dois ou mais estados e uma cultura e clique em Comparar."
            />
          </CardBody>
        </Card>
      )}

      {resultado && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo por estado</CardTitle>
              <CardDescription>Clima dos últimos 14 dias e produtividade do último ano agrícola, mais as médias do período escolhido.</CardDescription>
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Estado</th>
                      <th className="py-2 pr-4 font-medium">Temperatura (14 d)</th>
                      <th className="py-2 pr-4 font-medium">Chuva (14 d)</th>
                      <th className="py-2 pr-4 font-medium">Produtividade (último ano, todas as culturas)</th>
                      <th className="py-2 pr-4 font-medium">Alertas</th>
                      <th className="py-2 pr-4 font-medium">Produtividade média da cultura</th>
                      <th className="py-2 font-medium">Chuva mensal média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.resumo.map((l, i) => (
                      <tr key={l.uf} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CORES[i % CORES.length] }} />
                            {formatUfLabel(l.uf)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{l.temperatura}</td>
                        <td className="py-2 pr-4 tabular-nums">{l.precipitacao}</td>
                        <td className="py-2 pr-4 tabular-nums">{l.produtividadeUltimoAno}</td>
                        <td className="py-2 pr-4 tabular-nums">{l.alertas}</td>
                        <td className="py-2 pr-4 tabular-nums">{l.produtividadeMediaPeriodo != null ? `${l.produtividadeMediaPeriodo} t/ha` : '—'}</td>
                        <td className="py-2 tabular-nums">{l.chuvaMensalMediaPeriodo != null ? `${l.chuvaMensalMediaPeriodo} mm` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produtividade por ano</CardTitle>
              <CardDescription>Produtividade média (t/ha) da cultura selecionada em cada estado.</CardDescription>
            </CardHeader>
            <CardBody>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resultado.produtividade}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                    <XAxis dataKey="ano" stroke={chart.axis} fontSize={12} />
                    <YAxis stroke={chart.axis} fontSize={12} />
                    <Tooltip contentStyle={chart.tooltipStyle} labelStyle={chart.tooltipLabelStyle} />
                    <Legend />
                    {resultado.ufs.map((uf, i) => (
                      <Bar key={uf} dataKey={uf} name={uf} fill={CORES[i % CORES.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Regime de chuvas ao longo do ano</CardTitle>
              <CardDescription>Chuva mensal média (mm) no período, por mês do calendário.</CardDescription>
            </CardHeader>
            <CardBody>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={resultado.chuva}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                    <XAxis dataKey="mes" stroke={chart.axis} fontSize={12} />
                    <YAxis stroke={chart.axis} fontSize={12} />
                    <Tooltip contentStyle={chart.tooltipStyle} labelStyle={chart.tooltipLabelStyle} />
                    <Legend />
                    {resultado.ufs.map((uf, i) => (
                      <Line key={uf} type="monotone" dataKey={uf} name={uf} stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
