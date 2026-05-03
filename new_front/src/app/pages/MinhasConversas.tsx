import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { io, type Socket } from 'socket.io-client';
import { useUser } from '@clerk/clerk-react';
import { Cloud, Loader2, MessageCircle, SendHorizonal } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { HybridMediaAttachment } from '../components/chat/HybridMediaAttachment';
import { EncerrarAtendimentoModal } from '../components/chat/EncerrarAtendimentoModal';
import {
  getHybridTimeline,
  listHybridConversations,
  patchHybridConversationStatus,
  resolveSocketBaseUrl,
  sendProducerToWhatsapp,
  type HybridConversationDto,
  type HybridConversationListItem,
  type UnifiedChatMessage,
} from '../../lib/api/hybridChatApi';
import { notifyWhatsappDelivery } from '../../lib/whatsappNotify';

function maskWhatsapp(digits: string) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 4) return d || '—';
  return `•••• ${d.slice(-4)}`;
}

function displayUserMessageText(raw: string): string {
  return String(raw || '')
    .replace(/\n*\[Anexos:[^\]]+\]\s*$/i, '')
    .trimEnd();
}

export function MinhasConversas() {
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadParam = searchParams.get('thread');
  const deepLinkRetried = useRef(false);
  /** Evita chamar abrirConversa em loop quando `lista` ganha novo array a cada fetch. */
  const deepLinkConsumedFor = useRef<string | null>(null);
  const [lista, setLista] = useState<HybridConversationListItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [selected, setSelected] = useState<HybridConversationListItem | null>(null);
  const [messages, setMessages] = useState<UnifiedChatMessage[]>([]);
  const [hybridConversation, setHybridConversation] = useState<HybridConversationDto | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [input, setInput] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [encerrarModalOpen, setEncerrarModalOpen] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const selectedRef = useRef<HybridConversationListItem | null>(null);

  const humanHandoff =
    Boolean(hybridConversation?.intervencaoHumana && hybridConversation?.atendimentoAtivo);
  const canSendHuman = humanHandoff && hybridConversation?.id && user?.id && input.trim().length > 0;

  const carregarLista = useCallback(async () => {
    if (!user?.id) return;
    setLoadingLista(true);
    try {
      const r = await listHybridConversations(user.id);
      const rows = (r.conversations || []).filter((c) => c.intervencaoHumana);
      setLista(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar conversas.');
      setLista([]);
    } finally {
      setLoadingLista(false);
    }
  }, [user?.id]);

  const abrirConversa = useCallback(
    async (item: HybridConversationListItem) => {
      if (!user?.id) return;
      setSelected(item);
      selectedRef.current = item;
      threadIdRef.current = item.iaThreadId;
      setLoadingChat(true);
      try {
        const r = await getHybridTimeline(item.iaThreadId, user.id);
        setHybridConversation(r.conversation);
        setMessages(r.messages || []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao abrir conversa.');
        setMessages([]);
        setHybridConversation(null);
      } finally {
        setLoadingChat(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    deepLinkRetried.current = false;
    if (!threadParam) deepLinkConsumedFor.current = null;
  }, [threadParam]);

  useEffect(() => {
    if (!threadParam || !user?.id || loadingLista) return;
    const match = lista.find((c) => c.iaThreadId === threadParam);
    if (match) {
      if (deepLinkConsumedFor.current !== threadParam) {
        deepLinkConsumedFor.current = threadParam;
        void abrirConversa(match);
      }
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete('thread');
          return n;
        },
        { replace: true }
      );
      return;
    }
    if (!loadingLista && !deepLinkRetried.current) {
      deepLinkRetried.current = true;
      void carregarLista();
    }
  }, [threadParam, user?.id, loadingLista, lista, abrirConversa, setSearchParams, carregarLista]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingSend]);

  useEffect(() => {
    if (!user?.id) return;
    const base = resolveSocketBaseUrl();
    const socket: Socket = io(base, { path: '/socket.io', transports: ['websocket', 'polling'] });
    let isFirstConnect = true;
    socket.on('connect', () => {
      console.log('[Socket.IO] Conectado, entrando na sala produtor:', user.id);
      socket.emit('join:produtor', user.id);
      if (!isFirstConnect) {
        const currentSelected = selectedRef.current;
        if (currentSelected && user.id) {
          getHybridTimeline(currentSelected.iaThreadId, user.id)
            .then((r) => setMessages(r.messages || []))
            .catch(() => {/* silencioso */});
        }
      }
      isFirstConnect = false;
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket.IO] Desconectado:', reason);
    });
    socket.on('hybrid:message', (payload: { threadId?: string; message?: UnifiedChatMessage }) => {
      console.log('[Socket.IO] hybrid:message recebido:', payload?.message?.id, payload?.threadId);
      if (!payload?.message) return;
      const active = threadIdRef.current;
      if (payload.threadId && active && payload.threadId !== active) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message!.id)) return prev;
        return [...prev, { ...payload.message!, kind: 'hybrid' }];
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  // Polling de backup: recarrega o histórico a cada 5s enquanto há conversa ativa aberta.
  // Garante que mensagens apareçam mesmo se o Socket.IO não entregar o evento.
  useEffect(() => {
    if (!selected || !user?.id) return;
    const interval = setInterval(async () => {
      const cur = selectedRef.current;
      if (!cur || !user?.id) return;
      try {
        const r = await getHybridTimeline(cur.iaThreadId, user.id);
        setMessages((prev) => {
          const newMsgs = (r.messages || []).filter((m) => !prev.some((p) => p.id === m.id));
          if (newMsgs.length === 0) return prev;
          return [...prev, ...newMsgs];
        });
      } catch {/* silencioso */}
    }, 5000);
    return () => clearInterval(interval);
  }, [selected, user?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSendHuman || !hybridConversation?.id || !user?.id) return;
    const texto = input.trim();
    if (!texto) return;
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: UnifiedChatMessage = {
      id: optimisticId,
      sender: 'user',
      kind: 'hybrid',
      text: texto,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setLoadingSend(true);
    try {
      const response = await sendProducerToWhatsapp(hybridConversation.id, texto, user.id);
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === response.message.id)) return withoutOptimistic;
        return prev.map((m) => (m.id === optimisticId ? { ...m, id: response.message.id } : m));
      });
      notifyWhatsappDelivery(response.whatsapp);
      void carregarLista();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar.');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setLoadingSend(false);
    }
  }

  async function encerrarSemAvaliacao() {
    if (!user?.id || !hybridConversation?.id) return;
    setEncerrando(true);
    try {
      await patchHybridConversationStatus(hybridConversation.id, false, user.id);
      setHybridConversation((prev) => (prev ? { ...prev, atendimentoAtivo: false } : null));
      toast.success('Atendimento encerrado.');
      void carregarLista();
      if (selected) {
        setSelected({ ...selected, atendimentoAtivo: false });
      }
      setEncerrarModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao encerrar.');
    } finally {
      setEncerrando(false);
    }
  }

  async function encerrarComAvaliacao(a: { estrelas: number; comentario: string }) {
    if (!user?.id || !hybridConversation?.id) return;
    setEncerrando(true);
    try {
      await patchHybridConversationStatus(hybridConversation.id, false, user.id, {
        estrelas: a.estrelas,
        comentario: a.comentario || undefined,
      });
      setHybridConversation((prev) => (prev ? { ...prev, atendimentoAtivo: false } : null));
      toast.success('Obrigado pela avaliação. A média do especialista na rede foi atualizada.');
      void carregarLista();
      if (selected) {
        setSelected({ ...selected, atendimentoAtivo: false });
      }
      setEncerrarModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao encerrar.');
    } finally {
      setEncerrando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
          Minhas conversas
        </h1>
        <p className="text-muted-foreground text-sm">
          Histórico com especialistas (IAgro + WhatsApp).{' '}
          <Link to="/iagro" className="text-primary underline underline-offset-2">
            Ir ao IAgro
          </Link>
        </p>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-4">
        <aside className="flex min-h-0 max-h-[36vh] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:max-h-none lg:h-full">
          <div className="border-b border-border px-3 py-3 shrink-0">
            <p className="text-sm font-medium">Com especialista</p>
            <p className="text-xs text-muted-foreground">Toque para abrir o histórico completo</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
            {loadingLista && (
              <p className="text-xs text-muted-foreground px-2 py-4">Carregando...</p>
            )}
            {!loadingLista && lista.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                <p>Nenhuma conversa com agrônomo ainda.</p>
                <Link to="/iagro" className="inline-block mt-3 text-primary underline text-sm">
                  Conversar com o IAgro e enviar para um especialista
                </Link>
              </div>
            )}
            {!loadingLista &&
              lista.map((item) => {
                const active = selected?.id === item.id;
                const titulo =
                  item.casoResumoSnapshot?.slice(0, 52) ||
                  `Atendimento ${maskWhatsapp(item.whatsappAgronomo)}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void abrirConversa(item)}
                    className={`w-full rounded-lg border text-left px-3 py-2.5 transition-colors ${
                      active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <p className="text-xs font-medium text-foreground line-clamp-2">{titulo}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>Especialista {maskWhatsapp(item.whatsappAgronomo)}</span>
                      <span
                        className={
                          item.atendimentoAtivo ? 'text-green-600 dark:text-green-400' : ''
                        }
                      >
                        {item.atendimentoAtivo ? 'Ativo' : 'Encerrado'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.updatedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </button>
                );
              })}
          </div>
        </aside>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-full lg:min-h-0">
          <CardBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <MessageCircle className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">Selecione uma conversa à esquerda</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 shrink-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Especialista (WhatsApp {maskWhatsapp(selected.whatsappAgronomo)})
                    </p>
                    {selected.produtorNomeSnapshot && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Produtor: {selected.produtorNomeSnapshot}
                      </p>
                    )}
                  </div>
                  {humanHandoff && hybridConversation?.id && user?.id && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs shrink-0"
                      onClick={() => setEncerrarModalOpen(true)}
                    >
                      Encerrar atendimento
                    </Button>
                  )}
                </div>

                {humanHandoff && (
                  <div className="rounded-lg border border-green-600/40 bg-green-500/10 px-3 py-2 text-xs text-foreground shrink-0">
                    Atendimento humano ativo. Mensagens enviadas aqui chegam ao WhatsApp do agrônomo e as respostas aparecem abaixo em tempo real.
                  </div>
                )}

                {!humanHandoff && selected.atendimentoAtivo === false && (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground shrink-0">
                    Este atendimento foi encerrado. O histórico permanece visível; novas mensagens do
                    agrônomo não serão roteadas aqui.
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  {loadingChat && (
                    <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                  )}
                  {!loadingChat &&
                    messages.map((message) => {
                      const userDisplayText =
                        message.sender === 'user'
                          ? displayUserMessageText(message.text)
                          : message.text;
                      const alignEnd = message.sender === 'user';
                      const mdComponents = {
                        h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>,
                        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
                        h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
                        p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 leading-relaxed">{children}</p>,
                        ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
                        code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock
                            ? <code className="block bg-muted rounded-md px-3 py-2 text-xs font-mono overflow-x-auto my-2">{children}</code>
                            : <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                        },
                        pre: ({ children }: { children?: React.ReactNode }) => <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 font-mono">{children}</pre>,
                        blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground italic my-2">{children}</blockquote>,
                        hr: () => <hr className="border-border my-3" />,
                        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>,
                        table: ({ children }: { children?: React.ReactNode }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
                        th: ({ children }: { children?: React.ReactNode }) => <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">{children}</th>,
                        td: ({ children }: { children?: React.ReactNode }) => <td className="border border-border px-2 py-1">{children}</td>,
                      };

                      return (
                        <div
                          key={message.id}
                          className={`${alignEnd ? 'flex justify-end' : 'flex justify-start'}`}
                        >
                          {message.sender === 'assistant' ? (
                            <div className="flex items-end gap-2 max-w-[85%]">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                                <Cloud className="h-4 w-4 text-white" />
                              </div>
                              <div className="w-fit max-w-full break-words rounded-lg bg-card border border-border px-3 py-2 text-sm text-card-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{message.text}</ReactMarkdown>
                              </div>
                            </div>
                          ) : message.sender === 'agronomo' ? (
                            <div className="flex items-end gap-2 max-w-[85%]">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600">
                                <MessageCircle className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex min-w-0 max-w-full flex-col gap-2">
                                {message.hasMidia && user?.id ? (
                                  <div className="rounded-lg border border-green-700/35 bg-green-600/5 p-2">
                                    <HybridMediaAttachment
                                      messageId={message.id}
                                      mimeType={message.midiaMimeType}
                                      clerkUserId={user.id}
                                    />
                                  </div>
                                ) : null}
                                <div className="w-fit max-w-full break-words rounded-lg border border-green-700/35 bg-green-600/10 px-3 py-2 text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{message.text}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="w-fit max-w-[85%] ml-auto">
                              <div className="whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm bg-primary text-primary-foreground">
                                {userDisplayText}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="shrink-0 pt-1">
                  <div className="relative flex gap-2">
                    <textarea
                      value={input}
                      onChange={(ev) => setInput(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' && !ev.shiftKey) {
                          ev.preventDefault();
                          if (canSendHuman && !loadingSend) void handleSubmit(ev as unknown as FormEvent);
                        }
                      }}
                      placeholder={
                        humanHandoff
                          ? 'Sua mensagem para o agrônomo...'
                          : 'Atendimento encerrado ou sem canal humano ativo.'
                      }
                      disabled={!humanHandoff}
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-border bg-input-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!canSendHuman || loadingSend}
                      className="self-end shrink-0"
                    >
                      {loadingSend ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <SendHorizonal className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <EncerrarAtendimentoModal
        isOpen={encerrarModalOpen}
        onClose={() => setEncerrarModalOpen(false)}
        onConfirmSemAvaliacao={() => void encerrarSemAvaliacao()}
        onConfirmComAvaliacao={(a) => void encerrarComAvaliacao(a)}
        loading={encerrando}
      />
    </div>
  );
}
