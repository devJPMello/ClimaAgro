import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Textarea } from '../components/ui/textarea';
import { FileText, Download, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateAiReport } from '../../lib/api/aiReportsApi';
import type { ReportHistoryItemDto } from '../../lib/api/contracts/aiReports';
import { createReportExport, listReportExports } from '../../lib/api/reportExportsApi';
import type { ReportExportItemDto } from '../../lib/api/contracts/reportExports';
import { EmptyState } from '../components/ui/EmptyState';
import { displayLocalidadeLabel, TO_CITY_VALUE_TO_NAME } from '../../lib/geo/tocantinsCities';
import { getProductivitySeasonOptions } from '../../lib/filters/appFilters';
import { downloadReportFile, type ReportExportFileFormat } from '../../lib/reportExportFile';
import {
  gatherReportDados,
  type ReportTipoKey,
  localidadeKeyFromStoredLocal,
  parseSeasonBaseYear,
  parseExportPeriodoLabel,
  reportTipoFromStoredLabel,
} from '../../lib/report/gatherReportData';

function labelTipoRelatorio(value: string): string {
  if (value === 'clima') return 'Relatório de Clima';
  if (value === 'produtividade') return 'Relatório de Produtividade';
  return 'Relatório Comparativo';
}

export function ExportarRelatorios() {
  const [localidade, setLocalidade] = useState('Palmas');
  const { options: ibgeLocalOptions, loading: localidadesLoading, error: localidadesError } =
    useIbgeMunicipioSelectOptions();
  const localidadeSelectOptions = ibgeLocalOptions.map((o) => ({
    value: o.value,
    label: `${o.label} - TO`,
  }));

  useEffect(() => {
    if (!ibgeLocalOptions.length) return;
    const valid = new Set(ibgeLocalOptions.map((o) => o.value));
    if (valid.has(localidade)) return;
    const legacy = TO_CITY_VALUE_TO_NAME[localidade as keyof typeof TO_CITY_VALUE_TO_NAME];
    if (legacy && valid.has(legacy)) {
      setLocalidade(legacy);
      return;
    }
    if (valid.has('Palmas')) setLocalidade('Palmas');
  }, [ibgeLocalOptions, localidade]);
  const [tipoRelatorio, setTipoRelatorio] = useState('clima');
  const [periodoInicio, setPeriodoInicio] = useState('2026-01-01');
  const [periodoFim, setPeriodoFim] = useState('2026-04-16');
  const seasonOptions = useMemo(() => getProductivitySeasonOptions(), []);
  const [safraProdutividade, setSafraProdutividade] = useState(
    () => getProductivitySeasonOptions()[0]?.value ?? ''
  );
  const [formato, setFormato] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [loadingIA, setLoadingIA] = useState(false);
  const [instrucoesIA, setInstrucoesIA] = useState('');
  const [resumoIA, setResumoIA] = useState('');
  const [exportacoes, setExportacoes] = useState<ReportExportItemDto[]>([]);

  const mapHistorico = (): ReportHistoryItemDto[] =>
    exportacoes.map((item) => ({
      tipo: item.tipo,
      local: item.local,
      periodo: item.periodo,
      formato: item.formato,
      status: item.status,
      data: item.data,
    }));

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

  const handleGerarResumoIA = async () => {
    setLoadingIA(true);
    try {
      const safraTrim = safraProdutividade.trim();
      const periodoIaInicio =
        (tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo') && safraTrim
          ? `Safra ${safraTrim}`
          : periodoInicio;
      const periodoIaFim =
        (tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo') && safraTrim
          ? `Safra ${safraTrim}`
          : periodoFim;
      const response = await generateAiReport({
        localidade,
        tipoRelatorio,
        periodoInicio: periodoIaInicio,
        periodoFim: periodoIaFim,
        formato,
        instrucoesUsuario: instrucoesIA,
        historicoRelatorios: mapHistorico(),
      });

      const highlights = response.highlights?.length
        ? `\n\nDestaques sugeridos:\n- ${response.highlights.join('\n- ')}`
        : '';
      setResumoIA(`${response.summary}${highlights}`);
      toast.success('Resumo com IA gerado com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar resumo com IA.');
    } finally {
      setLoadingIA(false);
    }
  };

  const handleExportar = async () => {
    const safraTrim = safraProdutividade.trim();
    if ((tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo') && !safraTrim) {
      toast.error('Selecione a safra agrícola para o relatório de produtividade/comparativo.');
      return;
    }
    setLoading(true);
    try {
      const local = displayLocalidadeLabel(localidade);
      const tipo = labelTipoRelatorio(tipoRelatorio);
      const baseYear = safraTrim ? parseSeasonBaseYear(safraTrim) : null;
      const climaInicioComparativo = baseYear != null ? `${baseYear}-01-01` : periodoInicio;
      const climaFimComparativo = baseYear != null ? `${baseYear}-12-31` : periodoFim;
      const periodo =
        (tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo') && safraTrim
          ? tipoRelatorio === 'comparativo' && baseYear != null
            ? `Safra ${safraTrim} (clima ${baseYear})`
            : `Safra ${safraTrim}`
          : `${periodoInicio} — ${periodoFim}`;
      const fmt = formato as ReportExportFileFormat;

      const dadosIntegrados = await gatherReportDados({
        tipo: tipoRelatorio as ReportTipoKey,
        localidadeKey: localidade,
        displayLocal: local,
        startDate: tipoRelatorio === 'comparativo' ? climaInicioComparativo : periodoInicio,
        endDate: tipoRelatorio === 'comparativo' ? climaFimComparativo : periodoFim,
        productivitySeason:
          tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo' ? safraTrim : undefined,
      });

      downloadReportFile({
        titulo: tipo,
        local,
        periodo,
        formato: fmt,
        corpoTexto: resumoIA.trim() || undefined,
        dadosIntegrados,
      });

      if (fmt === 'xlsx') {
        toast.message('Ficheiro CSV gerado (abre no Excel com importação UTF-8).');
      }

      await createReportExport({
        tipo,
        local,
        periodo,
        formato: formato.toUpperCase(),
        status: 'concluido',
        foiGeradoComIA: Boolean(resumoIA.trim()),
      });
      toast.success('Download iniciado e registo guardado no histórico.');
      await carregarHistorico();
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
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Exportar Relatórios
        </h1>
        <p className="text-muted-foreground">
          Gere relatórios personalizados em diferentes formatos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configurar Relatório</CardTitle>
              <CardDescription>Selecione os parâmetros para gerar seu relatório</CardDescription>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Localidade"
                  value={localidade}
                  onChange={(e) => setLocalidade(e.target.value)}
                  options={localidadeSelectOptions}
                  disabled={localidadesLoading}
                  error={localidadesError ?? undefined}
                />

                <Select
                  label="Tipo de Relatório"
                  value={tipoRelatorio}
                  onChange={(e) => setTipoRelatorio(e.target.value)}
                  options={[
                    { value: 'clima', label: 'Relatório de Clima' },
                    { value: 'produtividade', label: 'Relatório de Produtividade' },
                    { value: 'comparativo', label: 'Relatório Comparativo' },
                  ]}
                />
              </div>

              {tipoRelatorio === 'produtividade' || tipoRelatorio === 'comparativo' ? (
                <Select
                  label="Safra agrícola"
                  value={safraProdutividade}
                  onChange={(e) => setSafraProdutividade(e.target.value)}
                  options={seasonOptions}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Período - Início"
                    type="date"
                    value={periodoInicio}
                    onChange={(e) => setPeriodoInicio(e.target.value)}
                  />

                  <Input
                    label="Período - Fim"
                    type="date"
                    value={periodoFim}
                    onChange={(e) => setPeriodoFim(e.target.value)}
                  />
                </div>
              )}

              <Select
                label="Formato"
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                options={[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'csv', label: 'CSV' },
                  { value: 'xlsx', label: 'XLSX (Excel)' },
                ]}
              />

              <Button variant="primary" className="w-full" onClick={() => void handleExportar()} loading={loading}>
                <FileText className="w-4 h-4" />
                Gerar Relatório
              </Button>

              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium">Assistente de Relatórios com IA (Gemini)</p>
                <Textarea
                  placeholder="Opcional: descreva foco do relatório (ex.: riscos da próxima safra, comparação com últimos 6 meses)."
                  value={instrucoesIA}
                  onChange={(e) => setInstrucoesIA(e.target.value)}
                  rows={4}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleGerarResumoIA()}
                  loading={loadingIA}
                >
                  Gerar resumo com IA
                </Button>
                <Textarea
                  placeholder="O resumo gerado por IA aparecerá aqui e pode ser editado antes da exportação."
                  value={resumoIA}
                  onChange={(e) => setResumoIA(e.target.value)}
                  rows={6}
                />
              </div>
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
                <p className="text-sm mb-2">Formatos Disponíveis</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="w-12 font-medium">PDF:</span>
                    <span>Visualização e impressão</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-12 font-medium">CSV:</span>
                    <span>Análise em planilhas</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-12 font-medium">XLSX:</span>
                    <span>Excel com formatação</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm mb-2">Conteúdo do Relatório</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Dados climáticos históricos</li>
                  <li>• Análises de produtividade</li>
                  <li>• Gráficos e tendências</li>
                  <li>• Recomendações técnicas</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  O histórico usa o cabeçalho X-Export-Client-Id. O PDF/CSV é gerado no navegador; «Gerar relatório»
                  descarrega o ficheiro e marca o pedido como concluído.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Exportações</CardTitle>
          <CardDescription>Registros persistidos no banco para este navegador</CardDescription>
        </CardHeader>
        <CardBody>
          {loadingHistorico ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando histórico…</p>
          ) : exportacoes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma exportação ainda"
              description="Use «Gerar relatório» para registrar uma solicitação. Ela aparecerá aqui após salvar no servidor."
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
                    <th className="pb-3 text-sm text-muted-foreground">IA</th>
                    <th className="pb-3 text-sm text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {exportacoes.map((exp) => (
                    <tr key={exp.id} className="border-b border-border last:border-0">
                      <td className="py-4 text-sm">{exp.tipo}</td>
                      <td className="py-4 text-sm">{exp.local}</td>
                      <td className="py-4 text-sm">{exp.periodo}</td>
                      <td className="py-4">
                        <Badge variant="info">{exp.formato}</Badge>
                      </td>
                      <td className="py-4">
                        {exp.status === 'processando' && (
                          <Badge variant="default">
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            Processando
                          </Badge>
                        )}
                        {exp.status === 'registrado' && (
                          <Badge variant="medium">
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
                        {exp.foiGeradoComIA ? (
                          <Badge variant="info">Gemini</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-4">
                        {exp.status !== 'falha' && (
                          <Button
                            variant="ghost"
                            className="px-3 py-1"
                            onClick={() => void handleDownload(exp)}
                            title="Descarregar de novo com dados atuais da API (o resumo de IA não fica guardado no servidor)"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
