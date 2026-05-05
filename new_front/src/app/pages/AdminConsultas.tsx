import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  MessageCircle,
  Eye,
} from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  listAdminConsultas,
  getAdminConsultaDetail,
  type AdminConsultaListItem,
  type AdminConsultaDetailResponse,
} from '../../lib/api/adminConsultasApi';

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  aguardando: 'Aguardando',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

function statusBadgeVariant(status: string): React.ComponentProps<typeof Badge>['variant'] {
  switch (status) {
    case 'novo':
      return 'info';
    case 'aguardando':
      return 'medium';
    case 'em_andamento':
      return 'high';
    case 'concluido':
      return 'success';
    default:
      return 'default';
  }
}

const URGENCY_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

function urgencyBadgeVariant(u: string): React.ComponentProps<typeof Badge>['variant'] {
  switch (u) {
    case 'baixa':
      return 'low';
    case 'media':
      return 'medium';
    case 'alta':
      return 'high';
    default:
      return 'default';
  }
}

async function copyToClipboard(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

export function AdminConsultas() {
  const { user, isLoaded } = useUser();
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AdminConsultaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selectedRow, setSelectedRow] = useState<AdminConsultaListItem | null>(null);
  const [detail, setDetail] = useState<AdminConsultaDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [page]
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const r = await listAdminConsultas(user.id, listParams);
      setItems(r.items || []);
      setTotal(r.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar consultas.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, listParams]);

  useEffect(() => {
    if (isLoaded && user?.id) void load();
  }, [isLoaded, user?.id, load]);

  useEffect(() => {
    if (!selectedRow || !user?.id) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    void getAdminConsultaDetail(user.id, selectedRow.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar detalhe.');
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRow, user?.id]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="flex items-center gap-2 text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          <ClipboardList className="h-8 w-8 text-primary shrink-0" />
          Consulta
        </h1>
        <p className="text-muted-foreground">
          Tickets em <span className="font-mono text-xs">consultas_agronomicas</span> — ordenação por atualização (mais
          recente primeiro). Canal principal do híbrido na linha:{' '}
          <span className="font-medium text-foreground">ativo</span> primeiro; em empate,{' '}
          <span className="font-medium text-foreground">última atualização</span>.
        </p>
      </div>

      <Card>
        <CardBody className="!p-0">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Urgência</th>
                    <th className="px-4 py-3 font-medium">Assunto</th>
                    <th className="px-4 py-3 font-medium">Produtor</th>
                    <th className="px-4 py-3 font-medium">Especialista</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Aval.</th>
                    <th className="px-4 py-3 font-medium">Atualizado</th>
                    <th className="w-14 px-3 py-3 font-medium text-center" aria-label="Detalhe" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum registo{total === 0 ? '' : ` (total ${total})`}.
                      </td>
                    </tr>
                  )}
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedRow(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedRow(row);
                        }
                      }}
                      className="border-b border-border/80 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={statusBadgeVariant(row.status)} className="font-medium">
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={urgencyBadgeVariant(row.urgencia)} className="font-normal">
                          {URGENCY_LABEL[row.urgencia] ?? row.urgencia}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="line-clamp-2 font-medium text-foreground">{row.assunto}</p>
                        {row.preview && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.preview}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.produtorNome}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                          {row.produtorClerkId}
                        </p>
                      </td>
                      <td className="px-4 py-3">{row.agronomoNome || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.hybridWhatsappMasked ? (
                          <>
                            <span>WA {row.hybridWhatsappMasked}</span>
                            {row.hybridAtendimentoAtivo != null && (
                              <span className={row.hybridAtendimentoAtivo ? ' text-green-600' : ''}>
                                {' '}
                                · {row.hybridAtendimentoAtivo ? 'ativo' : 'encerrado'}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.atendimentoAvaliacaoEstrelas != null ? (
                          <span>{row.atendimentoAvaliacaoEstrelas}★</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.dataAtualizacao).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(row);
                          }}
                          className="inline-flex p-1.5 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-all text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                          aria-label="Ver detalhes da consulta"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} de {total}
              </span>
              {(() => {
                const WINDOW = 4;
                const half = Math.floor(WINDOW / 2);
                let start = Math.max(1, currentPage - half);
                const end = Math.min(totalPages, start + WINDOW - 1);
                if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
                const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

                return (
                  <div className="flex items-center gap-1 flex-wrap justify-center">
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
                );
              })()}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={selectedRow !== null}
        onClose={() => {
          setSelectedRow(null);
          setDetail(null);
        }}
        title={selectedRow ? selectedRow.assunto.slice(0, 80) : 'Detalhe'}
        size="xl"
      >
        {detailLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {!detailLoading && detail && selectedRow && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(detail.consulta.status)}>
                {STATUS_LABEL[detail.consulta.status] ?? detail.consulta.status}
              </Badge>
              <Badge variant={urgencyBadgeVariant(detail.consulta.urgencia)}>
                {URGENCY_LABEL[detail.consulta.urgencia] ?? detail.consulta.urgencia}
              </Badge>
              <span className="text-xs text-muted-foreground">{detail.consulta.especialidade}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-sm border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Solicitação</p>
                <p className="font-medium">
                  {new Date(detail.consulta.dataSolicitacao).toLocaleString('pt-BR')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Última atualização</p>
                <p className="font-medium">
                  {new Date(detail.consulta.dataAtualizacao).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">Pré-visualização</p>
              <p className="text-foreground whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                {detail.consulta.preview || '—'}
              </p>
            </div>

            {(detail.consulta.atendimentoAvaliacaoEstrelas != null ||
              detail.consulta.atendimentoAvaliacaoComentario) && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-foreground">Avaliação do produtor</p>
                {detail.consulta.atendimentoAvaliacaoEstrelas != null && (
                  <p className="text-sm">{detail.consulta.atendimentoAvaliacaoEstrelas}★</p>
                )}
                {detail.consulta.atendimentoAvaliacaoEm && (
                  <p className="text-xs text-muted-foreground">
                    Em {new Date(detail.consulta.atendimentoAvaliacaoEm).toLocaleString('pt-BR')}
                  </p>
                )}
                {detail.consulta.atendimentoAvaliacaoComentario && (
                  <p className="text-sm text-foreground whitespace-pre-wrap rounded-lg bg-muted/40 p-3">
                    {detail.consulta.atendimentoAvaliacaoComentario}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 border-t border-border pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Produtor</p>
                <p className="font-medium">{detail.consulta.produtorNome}</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{detail.consulta.produtorClerkId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Especialista</p>
                <p className="font-medium">{detail.consulta.agronomoNome || '—'}</p>
                {detail.consulta.agronomoClerkId && (
                  <p className="font-mono text-xs text-muted-foreground break-all">{detail.consulta.agronomoClerkId}</p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Atalhos e identificadores</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => void copyToClipboard('ID da consulta', detail.consulta.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  ID consulta
                </Button>
                {detail.primaryHybridId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => void copyToClipboard('ID conversa híbrida', detail.primaryHybridId!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    ID conversa híbrida
                  </Button>
                )}
                {detail.primaryHybridIaThreadId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => void copyToClipboard('Thread IA', detail.primaryHybridIaThreadId!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Thread IA
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O deep link <span className="font-mono">/minhas-conversas?thread=…</span> lista apenas conversas do
                utilizador autenticado. Para ver o fio como produtor, use sessão desse produtor ou os IDs acima em
                suporte interno.
              </p>
              {detail.primaryHybridIaThreadId && (
                <Link
                  to={`/minhas-conversas?thread=${encodeURIComponent(detail.primaryHybridIaThreadId)}`}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <MessageCircle className="h-4 w-4" />
                  Abrir rota Minhas conversas (thread atual no URL)
                </Link>
              )}
            </div>

            {detail.hybridConversations.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground mb-2">
                  Conversas híbridas ligadas ({detail.hybridConversations.length})
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-muted/40 text-muted-foreground text-xs">
                      <tr>
                        <th className="px-3 py-2 font-medium">WA</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium">Atualizado</th>
                        <th className="px-3 py-2 font-medium">Thread IA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/80">
                      {detail.hybridConversations.map((h) => (
                        <tr key={h.id} className={h.id === detail.primaryHybridId ? 'bg-primary/5' : ''}>
                          <td className="px-3 py-2 whitespace-nowrap">{h.whatsappMasked}</td>
                          <td className="px-3 py-2 text-xs">
                            {h.atendimentoAtivo ? <span className="text-green-600">Ativo</span> : 'Encerrado'}
                            {h.intervencaoHumana ? ' · Humano' : ''}
                            {h.id === detail.primaryHybridId ? ' · Principal' : ''}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(h.updatedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs break-all max-w-[180px]">{h.iaThreadId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        {!detailLoading && !detail && selectedRow && (
          <p className="text-sm text-muted-foreground text-center py-8">Não foi possível carregar o detalhe.</p>
        )}
      </Modal>
    </div>
  );
}
