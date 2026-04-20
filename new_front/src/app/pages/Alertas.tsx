import { useEffect, useMemo } from 'react';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { AlertCard } from '../components/ui/AlertCard';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertTriangle, Filter, Download } from 'lucide-react';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { listClimateAlerts } from '../../lib/api/alertsApi';
import type { ClimateAlertDto, ClimateAlertListDto } from '../../lib/api/contracts/alerts';
import { TO_CITY_VALUE_TO_NAME } from '../../lib/geo/tocantinsCities';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { usePersistedState } from '../../lib/hooks/usePersistedState';

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function Alertas() {
  const [severidadeFiltro, setSeveridadeFiltro] = usePersistedState('climaagro.pref.alertas.severidade', 'todos');
  const [tipoFiltro, setTipoFiltro] = usePersistedState('climaagro.pref.alertas.tipo', 'todos');
  const [regiaoFiltro, setRegiaoFiltro] = usePersistedState('climaagro.pref.alertas.cidade', 'todos');
  const { options: munOptions, loading: munLoading, error: munError } = useIbgeMunicipioSelectOptions();
  const muniSelectOptions = useMemo(() => [{ value: 'todos', label: 'Todos' }, ...munOptions], [munOptions]);

  useEffect(() => {
    if (regiaoFiltro === 'todos') return;
    if (munOptions.some((o) => o.value === regiaoFiltro)) return;
    const legacy = TO_CITY_VALUE_TO_NAME[regiaoFiltro as keyof typeof TO_CITY_VALUE_TO_NAME];
    if (legacy && munOptions.some((o) => o.value === legacy)) setRegiaoFiltro(legacy);
  }, [regiaoFiltro, munOptions, setRegiaoFiltro]);

  const cityFilterLabel = regiaoFiltro !== 'todos' ? regiaoFiltro : undefined;
  const { status, data, error, reload } = useAsyncResource(
    () => listClimateAlerts({ state: 'TO', city: cityFilterLabel }),
    [regiaoFiltro]
  );

  const filtros = useMemo(
    () => ({ severidadeFiltro, tipoFiltro, regiaoFiltro }),
    [severidadeFiltro, tipoFiltro, regiaoFiltro],
  );

  const filterItems = (items: ClimateAlertDto[]) =>
    items.filter((alerta) => {
      if (filtros.severidadeFiltro !== 'todos' && alerta.severidade !== filtros.severidadeFiltro) return false;
      if (filtros.tipoFiltro !== 'todos' && !alerta.tipo.toLowerCase().includes(filtros.tipoFiltro.toLowerCase()))
        return false;
      if (cityFilterLabel && !norm(alerta.local).includes(norm(cityFilterLabel))) return false;
      return true;
    });

  const contagem = (items: ClimateAlertDto[]) => ({
    critical: items.filter((a) => a.severidade === 'critical').length,
    high: items.filter((a) => a.severidade === 'high').length,
    medium: items.filter((a) => a.severidade === 'medium').length,
    low: items.filter((a) => a.severidade === 'low').length,
  });

  const formatUpdated = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Alertas Climáticos
        </h1>
        <p className="text-muted-foreground">
          Tocantins — monitoramento por município
        </p>
      </div>

      <AsyncStateView<ClimateAlertListDto>
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <Card>
            <CardBody>
              <EmptyState
                icon={AlertTriangle}
                title="Nenhum alerta no momento"
                description="Quando houver alertas climáticos, eles aparecerão aqui."
              />
            </CardBody>
          </Card>
        }
      >
        {(payload) => {
          const alertasFiltrados = filterItems(payload.items);
          const contagemSeveridade = contagem(payload.items);

          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Críticos</p>
                        <p className="text-2xl text-severity-critical" style={{ fontFamily: 'var(--font-serif)' }}>
                          {contagemSeveridade.critical}
                        </p>
                      </div>
                      <AlertTriangle className="w-8 h-8 text-severity-critical" />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Altos</p>
                        <p className="text-2xl text-severity-high" style={{ fontFamily: 'var(--font-serif)' }}>
                          {contagemSeveridade.high}
                        </p>
                      </div>
                      <AlertTriangle className="w-8 h-8 text-severity-high" />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Médios</p>
                        <p className="text-2xl text-severity-medium" style={{ fontFamily: 'var(--font-serif)' }}>
                          {contagemSeveridade.medium}
                        </p>
                      </div>
                      <AlertTriangle className="w-8 h-8 text-severity-medium" />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Baixos</p>
                        <p className="text-2xl text-severity-low" style={{ fontFamily: 'var(--font-serif)' }}>
                          {contagemSeveridade.low}
                        </p>
                      </div>
                      <AlertTriangle className="w-8 h-8 text-severity-low" />
                    </div>
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardBody>
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Select
                        label="Severidade"
                        value={severidadeFiltro}
                        onChange={(e) => setSeveridadeFiltro(e.target.value)}
                        options={[
                          { value: 'todos', label: 'Todas' },
                          { value: 'critical', label: 'Crítica' },
                          { value: 'high', label: 'Alta' },
                          { value: 'medium', label: 'Média' },
                          { value: 'low', label: 'Baixa' },
                        ]}
                      />

                      <Select
                        label="Tipo"
                        value={tipoFiltro}
                        onChange={(e) => setTipoFiltro(e.target.value)}
                        options={[
                          { value: 'todos', label: 'Todos' },
                          { value: 'temperatura', label: 'Temperatura' },
                          { value: 'umidade', label: 'Umidade' },
                          { value: 'geada', label: 'Geada' },
                          { value: 'vento', label: 'Vento' },
                        ]}
                      />

                      <Select
                        label="Município"
                        value={regiaoFiltro}
                        onChange={(e) => setRegiaoFiltro(e.target.value)}
                        options={muniSelectOptions}
                        disabled={munLoading}
                        error={munError ?? undefined}
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <Button variant="secondary" type="button">
                        <Filter className="w-4 h-4" />
                        Filtrar
                      </Button>
                      <Button variant="ghost" type="button">
                        <Download className="w-4 h-4" />
                        Exportar
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {alertasFiltrados.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {alertasFiltrados.map((alerta) => (
                    <AlertCard key={alerta.id} {...alerta} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardBody>
                    <EmptyState
                      icon={AlertTriangle}
                      title="Nenhum alerta encontrado"
                      description="Não há alertas que correspondam aos filtros selecionados. Tente ajustar os critérios de busca."
                    />
                  </CardBody>
                </Card>
              )}

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Mostrando {alertasFiltrados.length} de {payload.items.length} alertas
                </span>
                <span>Última atualização: {formatUpdated(payload.updatedAt)}</span>
              </div>
            </>
          );
        }}
      </AsyncStateView>
    </div>
  );
}
