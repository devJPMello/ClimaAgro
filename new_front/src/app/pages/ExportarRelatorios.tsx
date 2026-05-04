import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FileText, Download, Clock, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { createReportExport, listReportExports } from '../../lib/api/reportExportsApi';
import type { ReportExportItemDto } from '../../lib/api/contracts/reportExports';
import { EmptyState } from '../components/ui/EmptyState';
import { brazilUfSelectOptionsAlphabetical, UF_SELECT_PLACEHOLDER_OPTION } from '../../lib/geo/brazilStatesMalha';
import { displayLocalidadeLabel } from '../../lib/geo/tocantinsCities';
import { getProductivityYearOptions } from '../../lib/filters/appFilters';
import { downloadReportFile, type ReportExportFileFormat } from '../../lib/reportExportFile';
import {
  gatherReportDados,
  type ReportTipoKey,
  localidadeKeyFromStoredLocal,
  parseExportPeriodoLabel,
  reportTipoFromStoredLabel,
} from '../../lib/report/gatherReportData';

const PAGE_SIZE_HISTORICO = 4;

type FiltroTipoHistorico = 'todos' | ReportTipoKey;
type OrdenacaoHistorico = 'recente' | 'tipo_asc' | 'local_asc';

function labelTipoRelatorio(value: string): string {
  if (value === 'clima') return 'Relatório de Clima';
  if (value === 'produtividade') return 'Relatório de Produtividade';
  return 'Relatório Comparativo';
}

function labelFormatoResumo(value: string): string {
  if (value === 'pdf') return 'PDF';
  if (value === 'csv') return 'CSV (separador ;)';
  return 'Excel (arquivo .csv compatível com Excel / LibreOffice)';
}

export function ExportarRelatorios() {
  const [localidade, setLocalidade] = useState('');
  const localidadeSelectOptions = useMemo(
    () => [UF_SELECT_PLACEHOLDER_OPTION, ...brazilUfSelectOptionsAlphabetical()],
    []
  );
  const localidadeValida = /^[A-Z]{2}$/.test(localidade);
  const [tipoRelatorio, setTipoRelatorio] = useState('clima');
  const yearOptions = useMemo(() => getProductivityYearOptions(), []);
  const [anoInicio, setAnoInicio] = useState(yearOptions[Math.min(2, yearOptions.length - 1)]?.value ?? '2024');
  const [anoFim, setAnoFim] = useState(yearOptions[0]?.value ?? '2026');
  const [formato, setFormato] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [exportacoes, setExportacoes] = useState<ReportExportItemDto[]>([]);
  const [paginaHistorico, setPaginaHistorico] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [filtroTipoHistorico, setFiltroTipoHistorico] = useState<FiltroTipoHistorico>('todos');
  const [ordenacaoHistorico, setOrdenacaoHistorico] = useState<OrdenacaoHistorico>('recente');

  const onAnoInicioChange = (value: string) => {
    setAnoInicio(value);
    const yi = parseInt(value, 10);
    const yf = parseInt(anoFim, 10);
    if (Number.isFinite(yi) && Number.isFinite(yf) && yi > yf) {
      setAnoFim(value);
    }
  };

  const onAnoFimChange = (value: string) => {
    setAnoFim(value);
    const yi = parseInt(anoInicio, 10);
    const yf = parseInt(value, 10);
    if (Number.isFinite(yi) && Number.isFinite(yf) && yf < yi) {
      setAnoInicio(value);
    }
  };

  const historicoFiltrado = useMemo(() => {
    let rows = [...exportacoes];
    if (filtroTipoHistorico !== 'todos') {
      rows = rows.filter((r) => reportTipoFromStoredLabel(r.tipo) === filtroTipoHistorico);
    }
    if (ordenacaoHistorico === 'tipo_asc') {
      rows.sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'));
    } else if (ordenacaoHistorico === 'local_asc') {
      rows.sort((a, b) => a.local.localeCompare(b.local, 'pt-BR'));
    }
    return rows;
  }, [exportacoes, filtroTipoHistorico, ordenacaoHistorico]);

  const totalPaginasHistorico = Math.max(1, Math.ceil(historicoFiltrado.length / PAGE_SIZE_HISTORICO));
  const paginaCorrigidaHistorico = Math.min(paginaHistorico, totalPaginasHistorico);
  const exportacoesPagina = historicoFiltrado.slice(
    (paginaCorrigidaHistorico - 1) * PAGE_SIZE_HISTORICO,
    paginaCorrigidaHistorico * PAGE_SIZE_HISTORICO
  );

  const resumoPedido = useMemo(() => {
    const y0 = Math.min(parseInt(anoInicio, 10), parseInt(anoFim, 10));
    const y1 = Math.max(parseInt(anoInicio, 10), parseInt(anoFim, 10));
    const periodo =
      Number.isFinite(y0) && Number.isFinite(y1) ? `De 1º de jan de ${y0} a 31 de dez de ${y1}` : '—';
    return {
      uf: localidadeValida ? displayLocalidadeLabel(localidade) : 'Selecione uma UF',
      tipo: labelTipoRelatorio(tipoRelatorio),
      periodo,
      formato: labelFormatoResumo(formato),
    };
  }, [anoFim, anoInicio, formato, localidade, localidadeValida, tipoRelatorio]);

  useEffect(() => {
    setPaginaHistorico((p) => Math.min(Math.max(1, p), totalPaginasHistorico));
  }, [historicoFiltrado.length, totalPaginasHistorico]);

  useEffect(() => {
    setPaginaHistorico(1);
  }, [filtroTipoHistorico, ordenacaoHistorico]);

  const carregarHistorico = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const { items } = await listReportExports();
      setExportacoes(items);
    } catch (e) {
      setExportacoes([]);
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o histórico de exportações.');
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const handleExportar = async () => {
    if (!localidadeValida) {
      toast.error('Selecione uma UF para definir o escopo do relatório.');
      return;
    }
    setLoading(true);
    try {
      const local = displayLocalidadeLabel(localidade);
      const tipo = labelTipoRelatorio(tipoRelatorio);
      const y0 = Math.min(parseInt(anoInicio, 10), parseInt(anoFim, 10));
      const y1 = Math.max(parseInt(anoInicio, 10), parseInt(anoFim, 10));
      const startDate = `${y0}-01-01`;
      const endDate = `${y1}-12-31`;
      const periodo = `Anos ${y0} — ${y1}`;
      const fmt = formato as ReportExportFileFormat;

      const dadosIntegrados = await gatherReportDados({
        tipo: tipoRelatorio as ReportTipoKey,
        localidadeKey: localidade,
        displayLocal: local,
        startDate,
        endDate,
      });

      downloadReportFile({
        titulo: tipo,
        local,
        periodo,
        formato: fmt,
        dadosIntegrados,
      });

      if (fmt === 'xlsx') {
        toast.message(
          'Arquivo CSV gerado (separador ;), em UTF-8. No Excel, use Dados > De texto/CSV ou abra direto conforme a versão.'
        );
      }

      await createReportExport({
        tipo,
        local,
        periodo,
        formato: formato.toUpperCase(),
        status: 'concluido',
      });
      toast.success('Download iniciado e registro salvo no histórico.');
      await carregarHistorico();
      setPaginaHistorico(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar ou registrar exportação.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (item: ReportExportItemDto) => {
    if (item.status === 'falha') {
      toast.message('Este pedido falhou; gere um novo relatório.');
      return;
    }
    setDownloadingId(item.id);
    try {
      const parsed = parseExportPeriodoLabel(item.periodo);
      const tipoItem = reportTipoFromStoredLabel(item.tipo);
      const key = localidadeKeyFromStoredLocal(item.local);
      const dadosIntegrados = await gatherReportDados({
        tipo: tipoItem,
        localidadeKey: key,
        displayLocal: item.local,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        productivitySeason:
          tipoItem === 'produtividade' || tipoItem === 'comparativo' ? parsed.productivitySeason : undefined,
      });
      const fmt = String(item.formato).toLowerCase() as ReportExportFileFormat;
      downloadReportFile({
        titulo: item.tipo,
        local: item.local,
        periodo: item.periodo,
        formato: fmt === 'pdf' || fmt === 'csv' || fmt === 'xlsx' ? fmt : 'pdf',
        corpoTexto: undefined,
        dadosIntegrados,
      });
      toast.success('Download iniciado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao montar o relatório.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Exportar Relatórios
        </h1>
        <p className="text-muted-foreground">
          Gere relatórios com dados reais da API; o arquivo é montado no seu navegador e um registro é enviado ao servidor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Configurar relatório</CardTitle>
              <CardDescription>Selecione os parâmetros e confira o resumo antes de gerar</CardDescription>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="UF (escopo do relatório)"
                  value={localidade}
                  onChange={(e) => setLocalidade(e.target.value)}
                  options={localidadeSelectOptions}
                />

                <Select
                  label="Tipo de relatório"
                  value={tipoRelatorio}
                  onChange={(e) => setTipoRelatorio(e.target.value)}
                  options={[
                    { value: 'clima', label: 'Relatório de Clima' },
                    { value: 'produtividade', label: 'Relatório de Produtividade' },
                    { value: 'comparativo', label: 'Relatório comparativo' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Ano inicial"
                  value={anoInicio}
                  onChange={(e) => onAnoInicioChange(e.target.value)}
                  options={yearOptions}
                />

                <Select
                  label="Ano final"
                  value={anoFim}
                  onChange={(e) => onAnoFimChange(e.target.value)}
                  options={yearOptions}
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Os anos definem o intervalo civil completo (1º de janeiro a 31 de dezembro dos extremos) usado nas
                consultas de clima e produtividade. Se o ano inicial for maior que o final, o outro campo é ajustado
                automaticamente.
              </p>

              {tipoRelatorio === 'comparativo' ? (
                <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/20 px-3 py-2">
                  <span className="font-medium text-foreground">Comparativo por anos civis:</span> o PDF traz resumo
                  executivo, duas tabelas mensais (clima e produtividade alinhadas por mês), resumo por cultura e, por
                  fim, o detalhe por registo. Relatórios antigos gravados com safra SIDRA usam outro formato (mês a mês
                  da API climate-vs-productivity).
                </p>
              ) : null}

              <Select
                label="Formato"
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                options={[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'csv', label: 'CSV (texto; separador ;)' },
                  {
                    value: 'xlsx',
                    label: 'Excel (mesmo conteúdo em .csv para abrir no Excel — não é planilha .xlsx binária)',
                  },
                ]}
              />

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">Resumo do pedido</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>
                    <span className="text-foreground font-medium">Local:</span> {resumoPedido.uf}
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Tipo:</span> {resumoPedido.tipo}
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Período:</span> {resumoPedido.periodo}
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Formato:</span> {resumoPedido.formato}
                  </li>
                </ul>
              </div>

              <Button
                variant="primary"
                className="w-full"
                onClick={() => void handleExportar()}
                loading={loading}
                disabled={!localidadeValida}
              >
                <FileText className="w-4 h-4" />
                Gerar relatório
              </Button>
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="text-sm mb-2 font-medium">Formatos</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="w-14 shrink-0 font-medium text-foreground">PDF</span>
                    <span>Texto estruturado com cabeçalho e bloco &quot;Dados climáticos e agrícolas&quot; vindos da API.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-14 shrink-0 font-medium text-foreground">CSV</span>
                    <span>Algumas linhas-chave (metadados + dados agregados em uma coluna), separador ponto e vírgula.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-14 shrink-0 font-medium text-foreground">Excel</span>
                    <span>
                      Na prática, o mesmo CSV (UTF-8, separador ;) salvo com extensão .csv — adequado para abrir no
                      Excel; não há arquivo .xlsx binário nem macros.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm mb-2 font-medium">O que entra no relatório</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
                  <li>
                    <strong className="text-foreground">Clima:</strong> resumo do período e tabela mensal agregada
                    (API de clima).
                  </li>
                  <li>
                    <strong className="text-foreground">Produtividade:</strong> resumo mensal, detalhe por cultura,
                    ano e município (API de produtividade).
                  </li>
                  <li>
                    <strong className="text-foreground">Comparativo:</strong> por anos civis, resumo executivo, duas
                    tabelas mensais (clima e produtividade), resumo por cultura e detalhe por registo; com safra SIDRA
                    no histórico, usa a série climate-vs-productivity.
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Não há gráficos embutidos no PDF nem recomendações agronômicas automáticas — apenas texto e números
                  obtidos das APIs.
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm mb-2 font-medium">Histórico neste navegador</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A lista é ligada a este aparelho e navegador (identificador guardado em armazenamento local). Limpar
                  dados do site ou trocar de navegador apaga ou altera esse histórico. O servidor só guarda o registro
                  enviado após o download.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0 flex-1">
            <CardTitle>Histórico de exportações</CardTitle>
            <CardDescription>
              Registros no servidor associados ao identificador deste navegador — use filtros para localizar itens
            </CardDescription>
          </div>
          {!loadingHistorico && exportacoes.length > 0 && (
            <div className="flex w-full shrink-0 flex-col gap-3 self-stretch sm:flex-row sm:items-end sm:gap-3 md:w-auto md:justify-end">
              <Select
                label="Filtrar por tipo"
                value={filtroTipoHistorico}
                onChange={(e) => setFiltroTipoHistorico(e.target.value as FiltroTipoHistorico)}
                className="sm:max-w-xs"
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'clima', label: 'Clima' },
                  { value: 'produtividade', label: 'Produtividade' },
                  { value: 'comparativo', label: 'Comparativo' },
                ]}
              />
              <Select
                label="Ordenar"
                value={ordenacaoHistorico}
                onChange={(e) => setOrdenacaoHistorico(e.target.value as OrdenacaoHistorico)}
                className="sm:max-w-xs"
                options={[
                  { value: 'recente', label: 'Mais recentes primeiro' },
                  { value: 'tipo_asc', label: 'Tipo (A–Z)' },
                  { value: 'local_asc', label: 'Local (A–Z)' },
                ]}
              />
            </div>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          {loadingHistorico ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando histórico…</p>
          ) : exportacoes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma exportação ainda"
              description='Use "Gerar relatório" para baixar o arquivo e salvar um registro. Ele aparecerá aqui após o envio ao servidor.'
            />
          ) : historicoFiltrado.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum resultado com este filtro"
              description="Altere o tipo ou limpe o filtro para ver todas as exportações."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 text-sm text-muted-foreground">Tipo</th>
                    <th className="pb-3 text-sm text-muted-foreground">Local</th>
                    <th className="pb-3 text-sm text-muted-foreground">Período</th>
                    <th className="pb-3 text-sm text-muted-foreground">Formato</th>
                    <th className="pb-3 text-sm text-muted-foreground">Status</th>
                    <th className="pb-3 text-sm text-muted-foreground">Data</th>
                    <th className="pb-3 text-sm text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {exportacoesPagina.map((exp) => (
                    <tr key={exp.id} className="border-b border-border last:border-0">
                      <td className="py-4 text-sm">{exp.tipo}</td>
                      <td className="py-4 text-sm">{exp.local}</td>
                      <td className="py-4 text-sm">{exp.periodo}</td>
                      <td className="py-4">
                        <Badge variant="info">{exp.formato}</Badge>
                      </td>
                      <td className="py-4">
                        {exp.status === 'processando' && (
                          <Badge variant="default" title="Status enviado pelo servidor; fluxo principal não usa fila assíncrona.">
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            Processando
                          </Badge>
                        )}
                        {exp.status === 'registrado' && (
                          <Badge variant="medium" title="Registro criado; o download pode ter sido feito por outro fluxo.">
                            <Clock className="w-3 h-3 mr-1" />
                            Registrado
                          </Badge>
                        )}
                        {exp.status === 'concluido' && (
                          <Badge variant="success">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Concluído
                          </Badge>
                        )}
                        {exp.status === 'falha' && (
                          <Badge variant="high">
                            <XCircle className="w-3 h-3 mr-1" />
                            Falha
                          </Badge>
                        )}
                      </td>
                      <td className="py-4 text-sm text-muted-foreground">{exp.data}</td>
                      <td className="py-4">
                        {exp.status !== 'falha' && (
                          <Button
                            variant="ghost"
                            className="px-3 py-1"
                            onClick={() => void handleDownload(exp)}
                            disabled={downloadingId === exp.id}
                            loading={downloadingId === exp.id}
                            title="Baixar de novo com os dados atuais da API (pode levar alguns segundos)"
                            aria-label={`Baixar novamente: ${exp.tipo}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPaginasHistorico > 1 && (() => {
                const WINDOW = 4;
                const half = Math.floor(WINDOW / 2);
                let start = Math.max(1, paginaCorrigidaHistorico - half);
                const end = Math.min(totalPaginasHistorico, start + WINDOW - 1);
                if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
                const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

                return (
                  <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
                    <span>
                      {(paginaCorrigidaHistorico - 1) * PAGE_SIZE_HISTORICO + 1}–
                      {Math.min(paginaCorrigidaHistorico * PAGE_SIZE_HISTORICO, historicoFiltrado.length)} de{' '}
                      {historicoFiltrado.length} exportações
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPaginaHistorico((p) => Math.max(1, p - 1))}
                        disabled={paginaCorrigidaHistorico === 1}
                        aria-label="Página anterior"
                        className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" aria-hidden />
                        Anterior
                      </button>

                      {start > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPaginaHistorico(1)}
                            aria-label="Ir para página 1"
                            className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                          >
                            1
                          </button>
                          {start > 2 && <span className="px-1 select-none">…</span>}
                        </>
                      )}

                      {pageNums.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPaginaHistorico(n)}
                          aria-label={`Ir para página ${n}`}
                          aria-current={n === paginaCorrigidaHistorico ? 'page' : undefined}
                          className={`w-8 h-8 rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            n === paginaCorrigidaHistorico
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {n}
                        </button>
                      ))}

                      {end < totalPaginasHistorico && (
                        <>
                          {end < totalPaginasHistorico - 1 && (
                            <span className="px-1 select-none">…</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setPaginaHistorico(totalPaginasHistorico)}
                            aria-label={`Ir para página ${totalPaginasHistorico}`}
                            className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                          >
                            {totalPaginasHistorico}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setPaginaHistorico((p) => Math.min(totalPaginasHistorico, p + 1))}
                        disabled={paginaCorrigidaHistorico === totalPaginasHistorico}
                        aria-label="Próxima página"
                        className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima
                        <ChevronRight className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
