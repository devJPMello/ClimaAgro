import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { AlertCard } from '../components/ui/AlertCard';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertTriangle, Filter, Download } from 'lucide-react';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { listClimateAlerts } from '../../lib/api/alertsApi';
import { listClimateUfs } from '../../lib/api/climateApi';
import type { ClimateAlertDto, ClimateAlertListDto } from '../../lib/api/contracts/alerts';
import { usePersistedState } from '../../lib/hooks/usePersistedState';

export function Alertas() {
  const [severidadeFiltro, setSeveridadeFiltro] = usePersistedState('climaagro.pref.alertas.severidade', 'todos');
  const [tipoFiltro, setTipoFiltro] = usePersistedState('climaagro.pref.alertas.tipo', 'todos');
  const [ufFiltro, setUfFiltro] = usePersistedState('climaagro.pref.alertas.uf', 'ALL');
  const [ufOptions, setUfOptions] = useState<Array<{ value: string; label: string }>>([
    { value: 'ALL', label: 'Brasil (todos)' },
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listClimateUfs();
        if (!cancelled && data.length) setUfOptions(data);
      } catch {
        // mantém fallback ALL
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { status, data, error, reload } = useAsyncResource(
    () => listClimateAlerts({ state: ufFiltro === 'ALL' ? undefined : ufFiltro }),
    [ufFiltro]
  );

  const filtros = useMemo(
    () => ({ severidadeFiltro, tipoFiltro }),
    [severidadeFiltro, tipoFiltro],
  );

  const filterItems = (items: ClimateAlertDto[]) =>
    items.filter((alerta) => {
      if (filtros.severidadeFiltro !== 'todos' && alerta.severidade !== filtros.severidadeFiltro) return false;
      if (filtros.tipoFiltro !== 'todos' && !alerta.tipo.toLowerCase().includes(filtros.tipoFiltro.toLowerCase()))
        return false;
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
          Monitoramento por UF — escolha um estado ou visão Brasil inteiro.
        </p>
      </div>

      <AsyncStateView<ClimateAlertListDto>
        status={status}
        data={data}
        error={error}
        onRetry={reload}
        isEmpty={() => false}
        empty={<></>}
      >
        {(payload) => {
          const alertasFiltrados = filterItems(payload.items);
          const contagemSeveridade = contagem(payload.items);
          const semDadosApi = payload.items.length === 0;

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
                        label="UF"
                        value={ufFiltro}
                        onChange={(e) => setUfFiltro(e.target.value)}
                        options={ufOptions}
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

              {semDadosApi ? (
                <Card>
                  <CardBody>
                    <EmptyState
                      icon={AlertTriangle}
                      title="Nenhum alerta nesta seleção"
                      description="Não há alertas nos últimos dias para a UF escolhida. Altere a UF acima (ex.: Brasil (todos)) ou os filtros de severidade / tipo."
                    />
                  </CardBody>
                </Card>
              ) : alertasFiltrados.length > 0 ? (
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
                      description="Não há alertas que correspondam aos filtros de severidade ou tipo. Limpe os filtros ou escolha outra UF."
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
