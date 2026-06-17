import React, { FormEvent, useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { io, type Socket } from 'socket.io-client';
import { useUser } from '@clerk/clerk-react';
import { Cloud, Loader2, MessageCircle, Mic, MicOff, Paperclip, SendHorizonal, Star, Trash2, X } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { HybridMediaAttachment } from '../components/chat/HybridMediaAttachment';
import { LocalAttachmentThumbnail, type LocalAttachmentKind } from '../components/chat/LocalAttachmentThumbnail';
import { EncerrarAtendimentoModal } from '../components/chat/EncerrarAtendimentoModal';
import { FileAttachmentPickerModal } from '../components/chat/FileAttachmentPickerModal';
import {
  deleteHybridConversation,
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
  let t = String(raw || '')
    .replace(/\n*\[Anexos:[^\]]+\]\s*$/i, '')
    .trimEnd();
  const line = t.trim();
  /** Legenda automática antiga só com nome do ficheiro — não mostrar como comentário. */
  if (/^\[ClimaAgro\]\s+\S+/i.test(line) && !line.includes('\n')) {
    return '';
  }
  return t;
}

type LocalMediaItem = { url: string; kind: LocalAttachmentKind };

const IMAGE_CACHE_PREFIX = 'climaagro.iagro.thread-images.';

function buildMessageImageKey(text: string): string {
  return String(text || '').trim();
}

function dataUrlToLocalKind(dataUrl: string): LocalAttachmentKind {
  return dataUrl.startsWith('data:application/pdf') ? 'pdf' : 'image';
}

function loadCachedThreadImages(targetThreadId: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(`${IMAGE_CACHE_PREFIX}${targetThreadId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function MinhasConversas() {
  const { user } = useUser();
  const navigate = useNavigate();
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
  const [deleteTarget, setDeleteTarget] = useState<HybridConversationListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Pré-visualizações locais (mesmo cache que o IAgro) para mensagens do utilizador com anexos. */
  const [messageMediaPreviews, setMessageMediaPreviews] = useState<Map<string, LocalMediaItem[]>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const selectedRef = useRef<HybridConversationListItem | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingHybridFile, setPendingHybridFile] = useState<File | null>(null);
  const [pendingHybridPreview, setPendingHybridPreview] = useState<string | null>(null);
  const [hybridUploadModalOpen, setHybridUploadModalOpen] = useState(false);

  const humanHandoff =
    Boolean(hybridConversation?.intervencaoHumana && hybridConversation?.atendimentoAtivo);
  /** Canal humano ativo: texto, voz e anexo (imagem/PDF) enviados ao WhatsApp do agrônomo. */
  const podeDigitar = humanHandoff && Boolean(hybridConversation?.id && user?.id);
  const avaliacaoEstrelas = hybridConversation?.avaliacaoEstrelas ?? selected?.avaliacaoEstrelas ?? null;
  const canSendMessage =
    podeDigitar && !loadingSend && (input.trim().length > 0 || Boolean(pendingHybridFile));

  useEffect(() => {
    return () => {
      if (pendingHybridPreview) URL.revokeObjectURL(pendingHybridPreview);
    };
  }, [pendingHybridPreview]);

  function clearPendingHybridAttachment() {
    setPendingHybridFile(null);
    setPendingHybridPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function onHybridFileSelected(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const ok =
      /^image\/(jpeg|png|webp|gif)$/i.test(f.type) || f.type === 'application/pdf';
    if (!ok) {
      toast.error('Só são aceites imagens (JPEG, PNG, WebP, GIF) ou PDF (até 5 MB).');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Ficheiro demasiado grande (máx. 5 MB).');
      return;
    }
    setPendingHybridPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setPendingHybridFile(f);
    setHybridUploadModalOpen(false);
  }

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
      setMessageMediaPreviews(new Map());
      try {
        const r = await getHybridTimeline(item.iaThreadId, user.id);
        setHybridConversation(r.conversation);
        const list = r.messages || [];
        setMessages(list);
        const cachedImages = loadCachedThreadImages(item.iaThreadId);
        const hydrated = new Map<string, LocalMediaItem[]>();
        for (const msg of list) {
          if (msg.sender !== 'user') continue;
          const key = buildMessageImageKey(msg.text);
          const found = cachedImages[key];
          if (Array.isArray(found) && found.length > 0) {
            hydrated.set(
              msg.id,
              found.map((url) => ({ url, kind: dataUrlToLocalKind(url) }))
            );
          }
        }
        setMessageMediaPreviews(hydrated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao abrir conversa.');
        setMessages([]);
        setHybridConversation(null);
        setMessageMediaPreviews(new Map());
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

  function toggleRecording() {
    if (!podeDigitar) return;
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Reconhecimento de voz não suportado. Use Chrome ou Edge.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (err: { error?: string }) => {
      setIsRecording(false);
      if (err.error !== 'aborted') toast.error(`Erro no microfone: ${err.error ?? 'desconhecido'}`);
    };
    recognition.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const transcript = Array.from(ev.results).map((r) => r[0].transcript).join('');
      setInput(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function explicarAnexosSemCanalHumano() {
    toast.info(
      'Para anexar imagens ou PDFs à conversa com a IA, abra o IAgro. Aqui pode consultar o histórico com o especialista.',
      {
        duration: 8000,
        action: {
          label: 'Abrir IAgro',
          onClick: () => navigate('/iagro'),
        },
      }
    );
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!podeDigitar) return;
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();
    const pasted = imageItems[0].getAsFile();
    if (pasted) {
      const dt = new DataTransfer();
      dt.items.add(pasted);
      onHybridFileSelected(dt.files);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    recognitionRef.current?.stop();
    if (!canSendMessage || !hybridConversation?.id || !user?.id) return;
    const caption = input.trim();
    const file = pendingHybridFile;
    if (!caption && !file) return;

    const textoPersistido = caption || (file ? '' : '');
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: UnifiedChatMessage = {
      id: optimisticId,
      sender: 'user',
      kind: 'hybrid',
      text: textoPersistido,
      createdAt: new Date().toISOString(),
      hasMidia: Boolean(file),
      midiaMimeType: file?.type ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setLoadingSend(true);
    try {
      const response = await sendProducerToWhatsapp(
        hybridConversation.id,
        caption,
        user.id,
        file ?? undefined
      );
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === response.message.id)) return withoutOptimistic;
        return prev.map((m) =>
          m.id === optimisticId
            ? {
                ...m,
                id: response.message.id,
                text: response.message.conteudo,
                hasMidia: Boolean(response.message.hasMidia ?? file),
                midiaMimeType: response.message.midiaMimeType ?? file?.type ?? null,
              }
            : m
        );
      });
      notifyWhatsappDelivery(response.whatsapp);
      if (file) clearPendingHybridAttachment();
      void carregarLista();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar.');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(caption);
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
      setHybridConversation((prev) =>
        prev ? { ...prev, atendimentoAtivo: false, avaliacaoEstrelas: a.estrelas } : null
      );
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

  async function confirmarDelete() {
    if (!user?.id || !deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDeletingId(id);
    try {
      await deleteHybridConversation(id, user.id);
      setLista((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        selectedRef.current = null;
        threadIdRef.current = null;
        setMessages([]);
        setHybridConversation(null);
      }
      toast.success('Conversa excluída.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 h-[calc(100dvh-5.25rem)] max-h-[calc(100dvh-5.25rem)] flex-col gap-3 overflow-hidden">
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[minmax(280px,22rem)_minmax(0,1fr)] lg:gap-5">
        <aside className="flex max-h-[42vh] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-full lg:max-h-none">
          <div className="shrink-0 border-b border-border px-4 py-3.5">
            <p className="text-base font-medium">Com especialista</p>
            <p className="text-sm text-muted-foreground">Toque para abrir o histórico completo</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3">
            {loadingLista && (
              <p className="px-2 py-4 text-sm text-muted-foreground">Carregando...</p>
            )}
            {!loadingLista && lista.length === 0 && (
              <div className="px-3 py-6 text-center text-base text-muted-foreground">
                <p>Nenhuma conversa com agrônomo ainda.</p>
                <Link to="/iagro" className="mt-3 inline-block text-sm text-primary underline">
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
                const isDeleting = deletingId === item.id;
                return (
                  <div key={item.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => void abrirConversa(item)}
                      className={`w-full rounded-lg border px-3.5 py-3 pr-9 text-left transition-colors ${
                        active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <p className="line-clamp-2 text-sm font-medium text-foreground">{titulo}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Especialista {maskWhatsapp(item.whatsappAgronomo)}</span>
                        {item.atendimentoAtivo ? (
                          <span className="text-green-600 dark:text-green-400">Ativo</span>
                        ) : item.avaliacaoEstrelas != null && item.avaliacaoEstrelas > 0 ? (
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < item.avaliacaoEstrelas! ? 'fill-yellow-400 text-yellow-400' : 'fill-muted-foreground/20 text-muted-foreground/20'}`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span>Encerrado</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(item.updatedAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </button>

                    {isDeleting ? (
                      <span className="absolute top-2 right-2 pointer-events-none">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Excluir conversa"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </aside>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-full lg:min-h-0">
          <CardBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden !px-5 !pb-4 !pt-5 lg:!px-6">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <MessageCircle className="mb-3 h-14 w-14 opacity-40" />
                <p className="text-base">Selecione uma conversa à esquerda</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-border pb-4">
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Especialista (WhatsApp {maskWhatsapp(selected.whatsappAgronomo)})
                    </p>
                    {(hybridConversation?.casoResumoSnapshot || selected.casoResumoSnapshot) && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {hybridConversation?.casoResumoSnapshot || selected.casoResumoSnapshot}
                      </p>
                    )}
                    {selected.produtorNomeSnapshot && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Produtor: {selected.produtorNomeSnapshot}
                      </p>
                    )}
                  </div>
                  {humanHandoff && hybridConversation?.id && user?.id && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-sm"
                      onClick={() => setEncerrarModalOpen(true)}
                    >
                      Encerrar atendimento
                    </Button>
                  )}
                </div>

                {humanHandoff && (
                  <div className="shrink-0 rounded-lg border border-green-600/40 bg-green-500/10 px-4 py-2.5 text-sm text-foreground">
                    Atendimento humano ativo. Mensagens enviadas aqui chegam ao WhatsApp do agrônomo e as respostas aparecem abaixo em tempo real.
                  </div>
                )}

                {!humanHandoff && selected.atendimentoAtivo === false && (
                  <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
                    Este atendimento foi encerrado. O histórico permanece visível; novas mensagens do
                    agrônomo não serão roteadas aqui.
                    {avaliacaoEstrelas != null && avaliacaoEstrelas > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-xs">Sua avaliação:</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${i < avaliacaoEstrelas ? 'fill-yellow-400 text-yellow-400' : 'fill-muted-foreground/20 text-muted-foreground/20'}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/20 p-4 md:p-5">
                  {loadingChat && (
                    <p className="text-base text-muted-foreground">Carregando mensagens...</p>
                  )}
                  {!loadingChat &&
                    messages.map((message) => {
                      const userDisplayText =
                        message.sender === 'user'
                          ? displayUserMessageText(message.text)
                          : message.text;
                      const alignEnd = message.sender === 'user';
                      const mdComponents = {
                        h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-1 mt-3 text-lg font-semibold">{children}</h1>,
                        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-1 mt-3 text-base font-semibold">{children}</h2>,
                        h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 mt-2 text-base font-medium">{children}</h3>,
                        p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2.5 text-[0.9375rem] leading-relaxed md:text-base">{children}</p>,
                        ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2.5 list-disc space-y-1 pl-5">{children}</ul>,
                        ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2.5 list-decimal space-y-1 pl-5">{children}</ol>,
                        li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
                        code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock
                            ? <code className="my-2 block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">{children}</code>
                            : <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>;
                        },
                        pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">{children}</pre>,
                        blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>,
                        hr: () => <hr className="my-4 border-border" />,
                        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>,
                        table: ({ children }: { children?: React.ReactNode }) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
                        th: ({ children }: { children?: React.ReactNode }) => <th className="border border-border bg-muted px-2.5 py-1.5 text-left text-sm font-semibold">{children}</th>,
                        td: ({ children }: { children?: React.ReactNode }) => <td className="border border-border px-2.5 py-1.5 text-sm">{children}</td>,
                      };

                      return (
                        <div
                          key={message.id}
                          className={`${alignEnd ? 'flex justify-end' : 'flex justify-start'}`}
                        >
                          {message.sender === 'assistant' ? (
                            <div className="flex max-w-[90%] items-end gap-2.5 md:max-w-[85%]">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                                <Cloud className="h-5 w-5 text-white" />
                              </div>
                              <div className="w-fit max-w-full break-words rounded-lg border border-border bg-card px-3.5 py-2.5 text-[0.9375rem] leading-snug text-card-foreground md:text-base [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{message.text}</ReactMarkdown>
                              </div>
                            </div>
                          ) : message.sender === 'agronomo' ? (
                            <div className="flex max-w-[90%] items-end gap-2.5 md:max-w-[85%]">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600">
                                <MessageCircle className="h-5 w-5 text-white" />
                              </div>
                              <div className="flex min-w-0 max-w-full flex-col gap-2">
                                {message.hasMidia && user?.id ? (
                                  <div className="rounded-lg border border-green-700/35 bg-green-600/5 p-2.5">
                                    <HybridMediaAttachment
                                      messageId={message.id}
                                      mimeType={message.midiaMimeType}
                                      clerkUserId={user.id}
                                    />
                                  </div>
                                ) : null}
                                <div className="w-fit max-w-full break-words rounded-lg border border-green-700/35 bg-green-600/10 px-3.5 py-2.5 text-[0.9375rem] leading-snug text-foreground md:text-base [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{message.text}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="ml-auto flex w-fit max-w-[90%] flex-col items-end gap-1 md:max-w-[85%]">
                              {(messageMediaPreviews.get(message.id) ?? []).map((item) => (
                                <LocalAttachmentThumbnail
                                  key={item.url}
                                  url={item.url}
                                  kind={item.kind}
                                  name="Anexo enviado"
                                  size="relaxed"
                                />
                              ))}
                              {message.hasMidia && user?.id ? (
                                <div className="w-full max-w-[min(100%,280px)] rounded-lg border border-primary/30 bg-primary/15 p-2">
                                  <HybridMediaAttachment
                                    messageId={message.id}
                                    mimeType={message.midiaMimeType}
                                    clerkUserId={user.id}
                                  />
                                </div>
                              ) : null}
                              {userDisplayText ? (
                                <div className="whitespace-pre-wrap break-words rounded-xl bg-primary px-3.5 py-2.5 text-[0.9375rem] leading-snug text-primary-foreground md:text-base">
                                  {userDisplayText}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="shrink-0 space-y-2 border-t border-border pt-2.5">
                  {pendingHybridFile && pendingHybridPreview ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2 py-2">
                      <LocalAttachmentThumbnail
                        url={pendingHybridPreview}
                        kind={pendingHybridFile.type === 'application/pdf' ? 'pdf' : 'image'}
                        name={pendingHybridFile.name}
                        size="compact"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {pendingHybridFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={clearPendingHybridAttachment}
                        disabled={loadingSend}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        aria-label="Remover anexo"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                  <div className="relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(ev) => setInput(ev.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' && !ev.shiftKey) {
                          ev.preventDefault();
                          if (canSendMessage) void handleSubmit(ev as unknown as FormEvent);
                        }
                      }}
                      placeholder={
                        podeDigitar
                          ? 'Sua mensagem será enviada ao WhatsApp do agrônomo...'
                          : 'Atendimento encerrado ou sem canal humano ativo.'
                      }
                      disabled={!podeDigitar}
                      rows={1}
                      className={[
                        'w-full h-14 resize-none overflow-hidden rounded-2xl border bg-input-background',
                        'py-4 pr-36 pl-12 text-sm leading-5 text-foreground placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        isRecording ? 'border-destructive' : 'border-border',
                      ].join(' ')}
                    />
                    {podeDigitar ? (
                      <button
                        type="button"
                        onClick={() => setHybridUploadModalOpen(true)}
                        title="Anexar imagem ou PDF (até 5 MB) — enviado ao WhatsApp do agrônomo"
                        className="absolute left-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Abrir anexo para enviar ao agrônomo"
                      >
                        <Paperclip className="h-4 w-4" aria-hidden />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={explicarAnexosSemCanalHumano}
                        title="Anexos à IA: abrir IAgro"
                        className="absolute left-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Anexos à IA — abrir IAgro"
                      >
                        <Paperclip className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleRecording}
                        disabled={!podeDigitar}
                        title={isRecording ? 'Parar gravação' : 'Transcrever áudio'}
                        className={[
                          'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          isRecording
                            ? 'text-destructive hover:bg-destructive/10'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        ].join(' ')}
                      >
                        {isRecording ? (
                          <MicOff className="h-4 w-4 animate-pulse" aria-hidden />
                        ) : (
                          <Mic className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <button
                        type="submit"
                        disabled={!canSendMessage}
                        aria-label="Enviar mensagem"
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingSend ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <SendHorizonal className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Enviar
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <FileAttachmentPickerModal
        isOpen={hybridUploadModalOpen}
        onClose={() => setHybridUploadModalOpen(false)}
        title="Anexar ficheiro"
        description={
          <p>
            Imagem (JPEG, PNG, WebP, GIF) ou PDF, até 5 MB. O anexo envia-se com a próxima mensagem ao WhatsApp do
            agrônomo.
          </p>
        }
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        multiple={false}
        onFilesSelected={onHybridFileSelected}
      />

      <EncerrarAtendimentoModal
        isOpen={encerrarModalOpen}
        onClose={() => setEncerrarModalOpen(false)}
        onConfirmSemAvaliacao={() => void encerrarSemAvaliacao()}
        onConfirmComAvaliacao={(a) => void encerrarComAvaliacao(a)}
        loading={encerrando}
      />

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!deletingId) setDeleteTarget(null); }}
        title="Excluir conversa"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={Boolean(deletingId)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void confirmarDelete()} loading={Boolean(deletingId)}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir a conversa
          {deleteTarget?.casoResumoSnapshot
            ? ` "${deleteTarget.casoResumoSnapshot.slice(0, 80)}"`
            : ''}
          ?
          <br />
          Essa ação remove a conversa e todas as mensagens do histórico.
        </p>
      </Modal>
    </div>
  );
}
