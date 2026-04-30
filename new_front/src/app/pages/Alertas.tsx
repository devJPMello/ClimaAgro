import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import {
  AlertTriangle, MapPin,
  ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { listClimateAlerts } from '../../lib/api/alertsApi';
import type { ClimateAlertDto, ClimateAlertListDto, ClimateAlertSeverity } from '../../lib/api/contracts/alerts';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { UF_NOME } from '../../lib/geo/brazilStatesMalha';

const ALL_UF_OPTIONS = [
  { value: 'ALL', label: 'Brasil (todos)' },
  ...Object.entries(UF_NOME)
    .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
    .map(([sigla, nome]) => ({ value: sigla, label: `${nome} (${sigla})` })),
];

const PAGE_SIZE = 6;

const SEVERITY_LABEL: Record<ClimateAlertSeverity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const SEVERITY_ICON_COLOR: Record<ClimateAlertSeverity, string> = {
  critical: 'text-severity-critical',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  low: 'text-severity-low',
};

function fonteLabel(fonte?: string) {
  if (fonte === 'inmet') return 'INMET';
  if (fonte === 'cptec') return 'CPTEC';
  return 'Derivado';
}

/** Tenta extrair sigla UF do campo local (ex: "Palmas - TO" → "TO"). */
function extractUf(local: string): string {
  const match = local.match(/[-–]\s*([A-Z]{2})\s*$/) ?? local.match(/\b([A-Z]{2})$/);
  return match ? match[1] : local;
}

export function Alertas() {
  const [severidadeFiltro, setSeveridadeFiltro] = usePersistedState('climaagro.pref.alertas.severidade', 'todos');
  const [tipoFiltro, setTipoFiltro] = usePersistedState('climaagro.pref.alertas.tipo', 'todos');
  const [ufFiltro, setUfFiltro] = usePersistedState('climaagro.pref.alertas.uf', 'ALL');
  const [page, setPage] = useState(1);
  const [selectedAlerta, setSelectedAlerta] = useState<ClimateAlertDto | null>(null);

  useEffect(() => {
    setPage(1);
  }, [severidadeFiltro, tipoFiltro, ufFiltro]);

  const { status, data, error, reload } = useAsyncResource(
    () => listClimateAlerts({ state: ufFiltro === 'ALL' ? undefined : ufFiltro }),
    [ufFiltro],
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
          const cnt = contagem(payload.items);
          const semDadosApi = payload.items.length === 0;
          const totalPages = Math.max(1, Math.ceil(alertasFiltrados.length / PAGE_SIZE));
          const currentPage = Math.min(page, totalPages);
          const paginados = alertasFiltrados.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

          return (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(
                  [
                    { label: 'Críticos', key: 'critical' },
                    { label: 'Altos', key: 'high' },
                    { label: 'Médios', key: 'medium' },
                    { label: 'Baixos', key: 'low' },
                  ] as const
                ).map(({ label, key }) => (
                  <Card key={key}>
                    <CardBody>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">{label}</p>
                          <p
                            className={`text-2xl text-severity-${key}`}
                            style={{ fontFamily: 'var(--font-serif)' }}
                          >
                            {cnt[key]}
                          </p>
                        </div>
                        <AlertTriangle className={`w-8 h-8 text-severity-${key}`} />
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {/* Tabela + Filtros */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle>Lista de Alertas</CardTitle>
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="w-52">
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
                      </div>
                      <div className="w-52">
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
                      </div>
                      <div className="w-64">
                        <Select
                          label="UF"
                          value={ufFiltro}
                          onChange={(e) => setUfFiltro(e.target.value)}
                          options={ALL_UF_OPTIONS}
                        />
                      </div>
                      {(severidadeFiltro !== 'todos' || tipoFiltro !== 'todos' || ufFiltro !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => { setSeveridadeFiltro('todos'); setTipoFiltro('todos'); setUfFiltro('ALL'); }}
                          className="text-xs text-primary hover:underline pb-2.5"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {semDadosApi ? (
                  <CardBody>
                    <EmptyState
                      icon={AlertTriangle}
                      title="Nenhum alerta nesta seleção"
                      description="Não há alertas nos últimos dias para a UF escolhida. Altere a UF ou os filtros."
                    />
                  </CardBody>
                ) : alertasFiltrados.length === 0 ? (
                  <CardBody>
                    <EmptyState
                      icon={AlertTriangle}
                      title="Nenhum alerta encontrado"
                      description="Nenhum alerta corresponde aos filtros. Limpe os filtros ou escolha outra UF."
                    />
                  </CardBody>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Tipo
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              UF
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Vigência
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Severidade
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Valor Atual
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Fonte
                            </th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {paginados.map((alerta) => (
                            <tr
                              key={alerta.id}
                              className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <AlertTriangle
                                    className={`w-4 h-4 flex-shrink-0 ${SEVERITY_ICON_COLOR[alerta.severidade]}`}
                                  />
                                  <span className="font-medium text-foreground">{alerta.tipo}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs font-semibold bg-muted px-2 py-0.5 rounded">
                                  {extractUf(alerta.local)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                {alerta.data}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={alerta.severidade} className="w-16 justify-center">
                                  {SEVERITY_LABEL[alerta.severidade]}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-foreground">{alerta.valorAtual}</td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">{fonteLabel(alerta.fonte)}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAlerta(alerta)}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  title="Ver detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  {/* Paginação */}
                  {(() => {
                    const WINDOW = 4;
                    const half = Math.floor(WINDOW / 2);
                    let start = Math.max(1, currentPage - half);
                    const end = Math.min(totalPages, start + WINDOW - 1);
                    if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
                    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

                    return (
                      <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, alertasFiltrados.length)} de{' '}
                          {alertasFiltrados.length} alertas
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Anterior
                          </button>

                          {start > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPage(1)}
                                className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                              >
                                1
                              </button>
                              {start > 2 && <span className="px-1 text-muted-foreground select-none">…</span>}
                            </>
                          )}

                          {pageNums.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPage(n)}
                              className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                                n === currentPage
                                  ? 'bg-primary text-primary-foreground'
                                  : 'hover:bg-muted text-muted-foreground'
                              }`}
                            >
                              {n}
                            </button>
                          ))}

                          {end < totalPages && (
                            <>
                              {end < totalPages - 1 && <span className="px-1 text-muted-foreground select-none">…</span>}
                              <button
                                type="button"
                                onClick={() => setPage(totalPages)}
                                className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                              >
                                {totalPages}
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Próxima
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </Card>
            </>
          );
        }}
      </AsyncStateView>

      {/* Modal de detalhes */}
      <Modal
        isOpen={selectedAlerta !== null}
        onClose={() => setSelectedAlerta(null)}
        title={selectedAlerta?.tipo ?? 'Detalhe do Alerta'}
      >
        {selectedAlerta && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={selectedAlerta.severidade}>
                {SEVERITY_LABEL[selectedAlerta.severidade]}
              </Badge>
              <span className="text-xs text-muted-foreground">Fonte: {fonteLabel(selectedAlerta.fonte)}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{selectedAlerta.local}</span>
              <span>·</span>
              <span>{selectedAlerta.data}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Valor Atual</p>
                <p className="text-sm font-medium text-foreground">{selectedAlerta.valorAtual}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Limiar</p>
                <p className="text-sm font-medium text-foreground">{selectedAlerta.limiar}</p>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Recomendação</p>
                <p className="text-sm text-foreground">{selectedAlerta.recomendacao}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Impacto Estimado</p>
                <p className="text-sm text-foreground">{selectedAlerta.impactoEstimado}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
