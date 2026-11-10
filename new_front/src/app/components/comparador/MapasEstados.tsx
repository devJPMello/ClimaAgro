import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Select';
import { MapMetricLegend } from '../maps/MapMetricLegend';
import { fillColorForMetric, formatPopupValueForMetric, type BrazilMapMetric } from '../maps/brazilMapConfig';
import { contornoParaSvg, carregarMalhaEstados, featureDaUf } from '../../../lib/comparador/mapaEstados';
import type { ResumoEstado } from '../../../lib/comparador/compararEstados';
import { formatUfLabel } from '../../../lib/geo/brazilStatesMalha';

type MetricaMapa = Extract<BrazilMapMetric, 'produtividade' | 'precipitacao' | 'temperatura'>;

const OPCOES: Array<{ value: MetricaMapa; label: string }> = [
  { value: 'produtividade', label: 'Produtividade média da cultura' },
  { value: 'precipitacao', label: 'Chuva dos últimos 14 dias' },
  { value: 'temperatura', label: 'Temperatura dos últimos 14 dias' },
];

function valorDaMetrica(r: ResumoEstado, metrica: MetricaMapa): number | null {
  if (metrica === 'produtividade') return r.produtividadeMediaPeriodo;
  if (metrica === 'precipitacao') return r.precipitacaoNum ?? null;
  return r.temperaturaNum ?? null;
}

/** Um mapa por estado, colorido pelo indicador escolhido e com a mesma escala de cores para todos. */
export function MapasEstados({ resumo }: { resumo: ResumoEstado[] }) {
  const [metrica, setMetrica] = useState<MetricaMapa>('produtividade');
  const [malha, setMalha] = useState<FeatureCollection | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    void carregarMalhaEstados().then((m) => {
      if (cancelado) return;
      setMalha(m);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const contornos = useMemo(
    () => new Map(resumo.map((r) => [r.uf, (() => { const f = featureDaUf(malha, r.uf); return f ? contornoParaSvg(f) : null; })()])),
    [malha, resumo]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Mapas dos estados</CardTitle>
            <CardDescription>Cada estado é pintado pelo indicador escolhido, na mesma escala de cores, para comparar à primeira vista.</CardDescription>
          </div>
          <div className="w-full sm:w-72">
            <Select
              label="Colorir por"
              value={metrica}
              options={OPCOES}
              onChange={(e) => setMetrica(e.target.value as MetricaMapa)}
            />
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {resumo.map((r) => {
            const valor = valorDaMetrica(r, metrica);
            const contorno = contornos.get(r.uf);
            return (
              <div key={r.uf} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-medium">{formatUfLabel(r.uf)}</p>
                <div className="mt-2 flex h-44 items-center justify-center">
                  {carregando ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando mapa" />
                  ) : contorno ? (
                    <svg
                      viewBox={`0 0 ${contorno.largura} ${contorno.altura}`}
                      className="h-full w-full"
                      role="img"
                      aria-label={`Mapa de ${formatUfLabel(r.uf)}`}
                    >
                      <path
                        d={contorno.d}
                        fill={fillColorForMetric(metrica, valor)}
                        stroke="#475569"
                        strokeWidth={0.8}
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="text-xs text-muted-foreground">Mapa indisponível</span>
                  )}
                </div>
                <p className="mt-2 text-lg tabular-nums">{formatPopupValueForMetric(metrica, valor)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.temperatura} · {r.precipitacao} · {r.alertas} {r.alertas === 1 ? 'alerta' : 'alertas'}
                </p>
              </div>
            );
          })}
        </div>
        <MapMetricLegend metric={metrica} className="mt-4" />
      </CardBody>
    </Card>
  );
}
