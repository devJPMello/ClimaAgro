import { FormEvent, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { io, type Socket } from 'socket.io-client';
import { useUser } from '@clerk/clerk-react';
import {
  Camera,
  Cloud,
  History,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Paperclip,
  SendHorizonal,
  Sprout,
  Star,
  Trash2,
  TriangleAlert,
  TrendingUp,
  Handshake,
  X,
} from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import {
  deleteIAgroThread,
  listIAgroThreads,
  sendIAgroMessage,
  toggleIAgroThreadFavorite,
  type ConciergeMeta,
  type IAgroThread,
} from '../../lib/api/iagroChatApi';
import {
  escalateToSpecialist,
  getHybridTimeline,
  patchHybridConversationStatus,
  resolveSocketBaseUrl,
  sendProducerToWhatsapp,
  type HybridConversationDto,
  type UnifiedChatMessage,
} from '../../lib/api/hybridChatApi';
import { listarAgronomosParceiros, type AgronomoParceiroApi } from '../../lib/api/agronomosParceirosApi';
import { notifyWhatsappDelivery } from '../../lib/whatsappNotify';
import { HybridMediaAttachment } from '../components/chat/HybridMediaAttachment';
import { EncerrarAtendimentoModal } from '../components/chat/EncerrarAtendimentoModal';
import { useNavigate } from 'react-router';

export function IAgro() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [threads, setThreads] = useState<IAgroThread[]>([]);
  const [messages, setMessages] = useState<UnifiedChatMessage[]>([]);
  const [hybridConversation, setHybridConversation] = useState<HybridConversationDto | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<Map<File, string>>(new Map());
  const [messageImages, setMessageImages] = useState<Map<string, string[]>>(new Map());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<IAgroThread | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [loadingEscalateList, setLoadingEscalateList] = useState(false);
  const [agronomosPick, setAgronomosPick] = useState<AgronomoParceiroApi[]>([]);
  const [escalateAgronomoId, setEscalateAgronomoId] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [conciergeSuggestion, setConciergeSuggestion] = useState<ConciergeMeta | null>(null);
  /** Parceiro que o encaminhamento automático usaria para esta triagem (mesma conversa / especialidade). */
  const [indicatedAgronomo, setIndicatedAgronomo] = useState<AgronomoParceiroApi | null>(null);
  const [loadingIndicatedAgronomo, setLoadingIndicatedAgronomo] = useState(false);
  const [encerrarModalOpen, setEncerrarModalOpen] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const IMAGE_CACHE_PREFIX = 'climaagro.iagro.thread-images.';

  const quickActions = [
    {
      title: 'Previsões Climáticas',
      description: 'Condições meteorológicas e tendências',
      prompt: 'Quais são as previsões climáticas para minha região nos próximos dias?',
      icon: Cloud,
    },
    {
      title: 'Recomendações Agrícolas',
      description: 'Melhores práticas para cada cultura',
      prompt: 'Me dê recomendações agrícolas para melhorar o manejo da lavoura.',
      icon: Sprout,
    },
    {
      title: 'Análise de Alertas',
      description: 'Interpretação de alertas climáticos',
      prompt: 'Analise os alertas climáticos recentes e explique os riscos para a produção.',
      icon: TriangleAlert,
    },
    {
      title: 'Dados de Produtividade',
      description: 'Análises históricas e tendências',
      prompt: 'Mostre uma análise de produtividade e tendências com base nos dados históricos.',
      icon: TrendingUp,
    },
  ];

  const canSend = (input.trim().length > 0 || pendingFiles.length > 0) && !loadingSend;
  const humanHandoff =
    Boolean(hybridConversation?.intervencaoHumana && hybridConversation?.atendimentoAtivo);
  const canUseHumanInput = humanHandoff && hybridConversation?.id && user?.id;

  async function refreshThreads() {
    const uid = user?.id;
    if (!uid) {
      setThreads([]);
      return;
    }
    setLoadingThreads(true);
    try {
      const response = await listIAgroThreads(uid);
      setThreads(response.threads || []);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function openThread(nextThreadId: string) {
    setLoadingHistory(true);
    try {
      let list: UnifiedChatMessage[] = [];
      if (user?.id) {
        const hybrid = await getHybridTimeline(nextThreadId, user.id);
        setHybridConversation(hybrid.conversation);
        list = hybrid.messages || [];
      } else {
        toast.error('Faça login para abrir o histórico de conversas.');
        setHybridConversation(null);
        setMessages([]);
        setThreadId(null);
        return;
      }
      setThreadId(nextThreadId);
      setMessages(list);
      const cachedImages = loadCachedThreadImages(nextThreadId);
      const hydratedImages = new Map<string, string[]>();
      for (const msg of list) {
        if (msg.sender !== 'user') continue;
        const key = buildMessageImageKey(msg.text);
        const found = cachedImages[key];
        if (Array.isArray(found) && found.length > 0) {
          hydratedImages.set(msg.id, found);
        }
      }
      setMessageImages(hydratedImages);
      setHistoryOpen(false);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void refreshThreads();
  }, [user?.id]);

  useEffect(() => {
    if (!conciergeSuggestion?.escalate) {
      setIndicatedAgronomo(null);
      return;
    }
    const hint = conciergeSuggestion.specialtyHint?.trim();
    let cancelled = false;
    setLoadingIndicatedAgronomo(true);
    void (async () => {
      try {
        const r = await listarAgronomosParceiros(hint ? { especialidade: hint, ativo: true } : { ativo: true });
        if (!cancelled) setIndicatedAgronomo(r.agronomos?.[0] ?? null);
      } catch {
        if (!cancelled) setIndicatedAgronomo(null);
      } finally {
        if (!cancelled) setLoadingIndicatedAgronomo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conciergeSuggestion]);

  useEffect(() => {
    threadIdRef.current = threadId;
    if (threadId) {
      try {
        sessionStorage.setItem('climaagro.iagro.activeThreadId', threadId);
      } catch {
        /* ignore */
      }
    }
  }, [threadId]);

  useEffect(() => {
    if (!user?.id) return;
    const base = resolveSocketBaseUrl();
    const socket = io(base, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join:produtor', user.id);
    });
    socket.on('hybrid:message', (payload: { threadId?: string; message?: UnifiedChatMessage }) => {
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
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingSend]);

  useEffect(() => {
    if (conciergeSuggestion?.escalate) {
      requestAnimationFrame(() =>
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      );
    }
  }, [conciergeSuggestion]);

  function toggleRecording() {
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
    recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      if (e.error !== 'aborted') toast.error(`Erro no microfone: ${e.error}`);
    };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join('');
      setInput(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function buildMessageImageKey(text: string): string {
    return String(text || '').trim();
  }

  /** Remove a linha `[Anexos: ...]` que o backend grava; não exibir ao reabrir o histórico. */
  function displayUserMessageText(raw: string): string {
    return String(raw || '')
      .replace(/\n*\[Anexos:[^\]]+\]\s*$/i, '')
      .trimEnd();
  }

  function buildPersistedUserText(messageText: string, files: File[]): string {
    const fileNames = files.map((file) => file.name).filter(Boolean);
    if (fileNames.length === 0) return messageText;
    const persistedBase = messageText || 'Arquivos enviados';
    return `${persistedBase}\n\n[Anexos: ${fileNames.join(', ')}]`;
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

  function saveCachedThreadImages(targetThreadId: string, key: string, images: string[]) {
    if (!targetThreadId || !key || images.length === 0) return;
    try {
      const cache = loadCachedThreadImages(targetThreadId);
      cache[key] = images;
      localStorage.setItem(`${IMAGE_CACHE_PREFIX}${targetThreadId}`, JSON.stringify(cache));
    } catch {
      toast.warning('Não foi possível manter todas as imagens no cache local.');
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao converter imagem.'));
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recognitionRef.current?.stop();
    const messageText = input.trim();
    if (!messageText && pendingFiles.length === 0) return;

    if (canUseHumanInput && pendingFiles.length > 0) {
      toast.error('No atendimento humano, envie apenas texto. Use o IAgro sem intervenção para anexos.');
      return;
    }

    if (canUseHumanInput && messageText) {
      const optimisticId = `tmp-${Date.now()}`;
      const optimistic: UnifiedChatMessage = {
        id: optimisticId,
        sender: 'user',
        kind: 'hybrid',
        text: messageText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput('');
      setLoadingSend(true);
      try {
        const response = await sendProducerToWhatsapp(
          hybridConversation!.id,
          messageText,
          user!.id
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId ? { ...m, id: response.message.id } : m
          )
        );
        notifyWhatsappDelivery(response.whatsapp);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao enviar mensagem.';
        toast.error(msg);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setLoadingSend(false);
      }
      return;
    }

    if (!user?.id) {
      toast.error('Faça login para conversar com o IAgro.');
      return;
    }

    const imageFiles = pendingFiles.filter((f) => f.type.startsWith('image/'));
    const imageUrls = imageFiles
      .map((f) => pendingPreviews.get(f))
      .filter((u): u is string => Boolean(u));

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: UnifiedChatMessage = {
      id: optimisticId,
      sender: 'user',
      kind: 'ia',
      text: messageText || (imageFiles.length > 0 ? 'Imagem enviada para análise' : 'Arquivos anexados'),
      createdAt: new Date().toISOString(),
    };

    if (imageUrls.length > 0) {
      setMessageImages((prev) => new Map(prev).set(optimisticId, imageUrls));
    }

    const filesToSend = [...pendingFiles];
    const persistedUserText = buildPersistedUserText(messageText, filesToSend);
    const imageDataUrls = await Promise.all(
      imageFiles.map(async (file) => await fileToDataUrl(file).catch(() => ''))
    );
    const filteredImageDataUrls = imageDataUrls.filter(Boolean);
    const keptUrls = new Set(imageUrls);
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    pendingPreviews.forEach((url) => { if (!keptUrls.has(url)) URL.revokeObjectURL(url); });
    setPendingFiles([]);
    setPendingPreviews(new Map());
    setLoadingSend(true);

    try {
      const response = await sendIAgroMessage(
        { message: messageText, threadId, files: filesToSend },
        user.id
      );
      if (response.concierge?.escalate) {
        setConciergeSuggestion(response.concierge);
      } else {
        setConciergeSuggestion(null);
      }
      const assistant: UnifiedChatMessage = {
        id: `tmp-assistant-${Date.now()}`,
        sender: 'assistant',
        kind: 'ia',
        text: response.response,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistant]);
      if (!threadId || threadId !== response.threadId) setThreadId(response.threadId);
      if (filteredImageDataUrls.length > 0) {
        saveCachedThreadImages(response.threadId, buildMessageImageKey(persistedUserText), filteredImageDataUrls);
      }
      await refreshThreads();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mensagem.';
      toast.error(msg);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setLoadingSend(false);
    }
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const newPreviews = new Map(pendingPreviews);
    files.forEach((f) => {
      if (f.type.startsWith('image/')) newPreviews.set(f, URL.createObjectURL(f));
    });
    setPendingPreviews(newPreviews);
    setPendingFiles((prev) => [...prev, ...files].slice(0, 6));
  }

  function removePendingFile(index: number) {
    const file = pendingFiles[index];
    if (pendingPreviews.has(file)) {
      URL.revokeObjectURL(pendingPreviews.get(file)!);
      const next = new Map(pendingPreviews);
      next.delete(file);
      setPendingPreviews(next);
    }
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    if (files.length === 0) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    handleFilesSelected(dt.files);
  }

  function applyQuickPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function applyPlantAnalysis() {
    setInput('Analise a imagem desta planta: identifique o estado de saúde, possíveis deficiências nutricionais, sinais de pragas ou doenças, necessidade de calagem, e me dê recomendações práticas de manejo.');
    fileInputRef.current?.click();
  }

  async function handleToggleFavorite(targetThread: IAgroThread) {
    if (!user?.id) return;
    await toggleIAgroThreadFavorite(targetThread.threadId, !targetThread.isFavorite, user.id);
    await refreshThreads();
  }

  function handleDeleteThread(targetThread: IAgroThread) {
    setThreadToDelete(targetThread);
  }

  async function confirmDeleteThread() {
    if (!threadToDelete || !user?.id) return;
    setDeletingThread(true);
    try {
      await deleteIAgroThread(threadToDelete.threadId, user.id);
      if (threadId === threadToDelete.threadId) {
        setThreadId(null);
        setMessages([]);
        setHybridConversation(null);
      }
      setThreadToDelete(null);
      await refreshThreads();
    } finally {
      setDeletingThread(false);
    }
  }

  async function openEscalateModal(presetEspecialidade?: string) {
    if (!user?.id) {
      toast.error('Faça login para acionar um especialista.');
      return;
    }
    if (!threadId) {
      toast.error('Inicie ou abra uma conversa com o IAgro antes.');
      return;
    }
    setEscalateOpen(true);
    setAgronomosPick([]);
    setEscalateAgronomoId('');
    setLoadingEscalateList(true);
    try {
      const hint = presetEspecialidade?.trim() || conciergeSuggestion?.specialtyHint?.trim();
      let r = await listarAgronomosParceiros(
        hint ? { especialidade: hint, ativo: true } : { ativo: true }
      );
      let list = r.agronomos || [];
      if (list.length === 0 && hint) {
        r = await listarAgronomosParceiros({ ativo: true });
        list = r.agronomos || [];
        if (list.length > 0) {
          toast.message('Nenhum parceiro nessa área; mostrando todos os agrônomos ativos.');
        }
      }
      setAgronomosPick(list);
      const first = list[0];
      setEscalateAgronomoId(first?.id != null ? String(first.id) : '');
    } catch {
      toast.error('Não foi possível carregar agrônomos.');
      setAgronomosPick([]);
    } finally {
      setLoadingEscalateList(false);
    }
  }

  async function autoEscalateSpecialist() {
    if (!user?.id || !threadId) return;
    const nome = user.fullName || user.firstName || 'Produtor(a)';
    const filter = conciergeSuggestion?.specialtyHint?.trim() || 'Pragas';
    setEscalating(true);
    try {
      const out = await escalateToSpecialist(
        {
          threadId,
          autoPickBySpecialty: true,
          specialtyFilter: filter,
          produtorNome: nome,
          casoDestaque: conciergeSuggestion?.reason,
          conciergeReason: conciergeSuggestion?.reason,
        },
        user.id
      );
      setConciergeSuggestion(null);
      notifyWhatsappDelivery(out.whatsapp);
      toast.success(
        out.agronomoNome
          ? `Conversa com ${out.agronomoNome} disponível em Minhas conversas.`
          : 'Atendimento humano ativado. Abrindo Minhas conversas.'
      );
      navigate(`/minhas-conversas?thread=${encodeURIComponent(threadId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no encaminhamento automático.');
    } finally {
      setEscalating(false);
    }
  }

  async function encerrarSemAvaliacaoIAgro() {
    if (!user?.id || !hybridConversation?.id) return;
    setEncerrando(true);
    try {
      await patchHybridConversationStatus(hybridConversation.id, false, user.id);
      setHybridConversation((prev) =>
        prev ? { ...prev, atendimentoAtivo: false } : null
      );
      toast.success('Atendimento encerrado. O agrônomo não roteia mais mensagens para este painel.');
      setEncerrarModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao encerrar.');
    } finally {
      setEncerrando(false);
    }
  }

  async function encerrarComAvaliacaoIAgro(a: { estrelas: number; comentario: string }) {
    if (!user?.id || !hybridConversation?.id) return;
    setEncerrando(true);
    try {
      await patchHybridConversationStatus(hybridConversation.id, false, user.id, {
        estrelas: a.estrelas,
        comentario: a.comentario || undefined,
      });
      setHybridConversation((prev) =>
        prev ? { ...prev, atendimentoAtivo: false } : null
      );
      toast.success('Obrigado pela avaliação. A média do especialista na rede foi atualizada.');
      setEncerrarModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao encerrar.');
    } finally {
      setEncerrando(false);
    }
  }

  async function confirmEscalate() {
    if (!user?.id || !threadId) return;
    const sel = agronomosPick.find((a) => String(a.id) === escalateAgronomoId);
    if (!sel?.whatsapp?.trim()) {
      toast.error('Selecione um agrônomo com WhatsApp cadastrado.');
      return;
    }
    const nome = user.fullName || user.firstName || 'Produtor(a)';
    setEscalating(true);
    try {
      const out = await escalateToSpecialist(
        {
          threadId,
          whatsappAgronomo: sel.whatsapp.trim(),
          agronomoParceiroId: String(sel.id),
          produtorNome: nome,
          casoDestaque: conciergeSuggestion?.reason,
          conciergeReason: conciergeSuggestion?.reason,
          specialtyFilter: conciergeSuggestion?.specialtyHint,
        },
        user.id
      );
      const digits = String(sel.whatsapp).replace(/\D/g, '');
      setHybridConversation({
        id: out.conversationId,
        intervencaoHumana: out.intervencaoHumana,
        atendimentoAtivo: out.atendimentoAtivo,
        whatsappAgronomo: digits,
      });
      setEscalateOpen(false);
      setConciergeSuggestion(null);
      notifyWhatsappDelivery(out.whatsapp);
      toast.success('Abrindo Minhas conversas para continuar com o especialista.');
      navigate(`/minhas-conversas?thread=${encodeURIComponent(threadId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao preparar envio.');
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className="space-y-6 relative">
      <div className="min-w-0 space-y-4">
      <div className="pr-28">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          IAgro
        </h1>
        <p className="text-muted-foreground">Chat com o assistente e encaminhamento ao agrônomo parceiro via WhatsApp.</p>
      </div>

      {humanHandoff && (
        <div className="rounded-xl border border-green-600/40 bg-green-500/10 px-4 py-3 text-sm text-foreground">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">Atendimento humano ativo</p>
              <p className="text-muted-foreground text-xs mt-1">
                Suas mensagens são encaminhadas ao WhatsApp do agrônomo (Twilio, se configurado). Respostas chegam aqui em tempo real. Encerre o ticket quando o caso for resolvido — mensagens posteriores do agrônomo não serão roteadas.
              </p>
            </div>
            {hybridConversation?.id && user?.id && hybridConversation.atendimentoAtivo && (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 text-xs"
                onClick={() => setEncerrarModalOpen(true)}
              >
                Encerrar atendimento
              </Button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setHistoryOpen((prev) => !prev)}
        className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center text-foreground transition-all hover:-translate-y-0.5 z-30 lg:right-0"
        aria-label={historyOpen ? 'Fechar histórico' : 'Abrir histórico'}
      >
        <History className="w-5 h-5" />
      </button>

      <Card>
        <CardBody className="space-y-4">
          <div className="h-[68vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            {loadingHistory && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}
            {!loadingHistory && messages.length === 0 && (
              <div className="px-2 py-6">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-sidebar-primary">
                  <Cloud className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-center text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                  Olá! Como posso ajudar?
                </h2>
                <p className="mx-auto max-w-3xl text-center text-muted-foreground">
                  Sou seu assistente especializado em monitoramento climático e produtividade agrícola.
                  <br />
                  Posso ajudar com:
                </p>

                <div className="mx-auto mt-6 max-w-4xl space-y-3">
                  {/* Card de análise de planta — destaque */}
                  <button
                    type="button"
                    onClick={applyPlantAnalysis}
                    className="w-full rounded-2xl border-2 border-dashed border-green-500/40 bg-green-500/5 px-6 py-5 text-left transition-all hover:border-green-500/70 hover:bg-green-500/10 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-4">
                      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-green-500/15 text-green-600">
                        <Camera className="h-7 w-7" />
                      </span>
                      <div className="flex-1">
                        <p className="text-base font-medium text-foreground">Analisar Planta com Foto</p>
                        <p className="text-sm text-muted-foreground">
                          Envie uma foto da sua cultura e receba um laudo agronômico completo: deficiências nutricionais, necessidade de calagem, pragas, doenças e recomendações de manejo.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700">
                        Enviar foto →
                      </span>
                    </div>
                  </button>

                  {/* Quick actions secundários */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.title}
                          type="button"
                          onClick={() => applyQuickPrompt(action.prompt)}
                          className="rounded-xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Icon className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-base text-foreground">{action.title}</p>
                              <p className="text-sm text-muted-foreground">{action.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {messages.map((message) => {
              const userDisplayText =
                message.sender === 'user' ? displayUserMessageText(message.text) : message.text;
              const alignEnd = message.sender === 'user';
              return (
              <div key={message.id} className={`${alignEnd ? 'flex justify-end' : 'flex justify-start'}`}>
                {message.sender === 'assistant' ? (
                  <div className="flex items-end gap-2 max-w-[78%]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                      <Cloud className="h-4 w-4 text-white" />
                    </div>
                    <div className={'w-fit max-w-full break-words rounded-lg bg-card border border-border px-3 py-2 text-sm text-card-foreground prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0'}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
                          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children, className }) => {
                            const isBlock = className?.includes('language-');
                            return isBlock
                              ? <code className="block bg-muted rounded-md px-3 py-2 text-xs font-mono overflow-x-auto my-2">{children}</code>
                              : <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                          },
                          pre: ({ children }) => <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 font-mono">{children}</pre>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground italic my-2">{children}</blockquote>,
                          hr: () => <hr className="border-border my-3" />,
                          a: ({ href, children }) => <a href={href} className="text-primary underline underline-offset-2 hover:text-primary-dark" target="_blank" rel="noopener noreferrer">{children}</a>,
                          table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
                          th: ({ children }) => <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">{children}</th>,
                          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : message.sender === 'agronomo' ? (
                  <div className="flex items-end gap-2 max-w-[78%]">
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
                      <div className="w-fit max-w-full break-words rounded-lg border border-green-700/35 bg-green-600/10 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                        {message.text}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-fit max-w-[78%] ml-auto flex flex-col items-end gap-1">
                    {(messageImages.get(message.id) ?? []).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Imagem enviada"
                        className="h-40 w-40 object-cover rounded-xl border border-white/20 shadow-sm"
                      />
                    ))}
                    {userDisplayText && (
                      <div className="whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm bg-primary text-primary-foreground">
                        {userDisplayText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}

            {conciergeSuggestion?.escalate && !loadingHistory && messages.length > 0 && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <Handshake className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-amber-900 dark:text-amber-200">Especialista indicado nesta conversa</p>
                    {loadingIndicatedAgronomo ? (
                      <p className="text-muted-foreground text-xs mt-1 inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        Buscando agrônomo parceiro alinhado ao tema deste chat…
                      </p>
                    ) : indicatedAgronomo ? (
                      <p className="text-foreground text-sm mt-1">
                        Para este caso, indicamos <strong>{indicatedAgronomo.nome}</strong>
                        {indicatedAgronomo.especialidade ? (
                          <span className="text-muted-foreground"> — {indicatedAgronomo.especialidade}</span>
                        ) : null}
                        .
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-xs mt-1">
                        Não há parceiro cadastrado para esta área ainda. Você ainda pode escolher outro agrônomo na lista.
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs mt-2">
                      {conciergeSuggestion.reason ||
                        'O IAgro entendeu que falar com um agrônomo ajuda neste ponto.'}
                      {conciergeSuggestion.specialtyHint ? (
                        <span className="block mt-1 text-foreground/90">
                          Área: <strong>{conciergeSuggestion.specialtyHint}</strong>
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="text-xs"
                        onClick={() => void autoEscalateSpecialist()}
                        loading={escalating}
                      >
                        Encaminhar para {indicatedAgronomo?.nome ?? 'especialista'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        onClick={() => void openEscalateModal(conciergeSuggestion.specialtyHint)}
                      >
                        Escolher outro agrônomo
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setConciergeSuggestion(null)}
                      >
                        Dispensar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loadingSend && !humanHandoff && (
              <div className="flex justify-start">
                <div className="flex items-end gap-2 max-w-[78%]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary animate-pulse">
                    <Cloud className="h-4 w-4 text-white" />
                  </div>
                  <div className="w-fit max-w-full rounded-lg bg-card border border-border px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Gerando resposta...
                  </div>
                </div>
              </div>
            )}
            {loadingSend && humanHandoff && (
              <div className="flex justify-end">
                <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando ao especialista...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="space-y-2" onSubmit={handleSubmit}>
            <div className="w-full space-y-2">
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {pendingFiles.map((file, index) => (
                    <span
                      key={`${file.name}-${index}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1 text-xs"
                    >
                      {pendingPreviews.get(file) ? (
                        <img
                          src={pendingPreviews.get(file)}
                          alt={file.name}
                          className="h-10 w-10 object-cover rounded-lg shrink-0"
                        />
                      ) : null}
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(index)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (canSend) {
                        void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
                      }
                    }
                  }}
                  placeholder={
                    humanHandoff
                      ? 'Sua mensagem será enviada ao WhatsApp do agrônomo...'
                      : 'Digite sua pergunta para o IAgro...'
                  }
                  rows={1}
                  className={[
                    'w-full h-14 resize-none overflow-hidden rounded-2xl border bg-input-background',
                    'py-4 pr-36 pl-12 text-sm leading-5 focus:outline-none focus:ring-0 transition-colors',
                    isRecording ? 'border-destructive' : 'border-border',
                  ].join(' ')}
                />
                <label className={`absolute left-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${humanHandoff ? 'cursor-not-allowed opacity-40' : 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    disabled={humanHandoff}
                    className="hidden"
                    accept="image/*,.txt,.csv,.json,.md,.pdf,.doc,.docx"
                    onChange={(event) => {
                      handleFilesSelected(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                  <Paperclip className="w-4 h-4" />
                </label>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    title={isRecording ? 'Parar gravação' : 'Transcrever áudio'}
                    className={[
                      'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                      isRecording
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    {isRecording
                      ? <MicOff className="w-4 h-4 animate-pulse" />
                      : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs text-primary-foreground transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingSend
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <SendHorizonal className="w-3.5 h-3.5" />}
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      </div>

      <div className={`fixed inset-0 z-40 ${historyOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <button
          type="button"
          aria-label="Fechar histórico"
          onClick={() => setHistoryOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity ${historyOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute top-0 right-0 h-full w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
            historyOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <div>
              <h2 className="text-lg">Histórico de Interações</h2>
            </div>
            <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-[calc(100%-76px)] overflow-y-auto p-4 space-y-2">
            {loadingThreads && <p className="text-sm text-muted-foreground">Carregando conversas...</p>}
            {!loadingThreads && threads.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conversa registrada ainda.</p>
            )}
            {threads.map((item) => (
              <div
                key={item.threadId}
                className={`w-full rounded-lg border px-3 py-2 transition-colors ${
                  threadId === item.threadId ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                }`}
              >
                <button type="button" onClick={() => void openThread(item.threadId)} className="w-full text-left">
                  <p className="text-sm text-foreground truncate">{item.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{item.totalMessages} mensagens</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleFavorite(item);
                        }}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                          item.isFavorite ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        title={item.isFavorite ? 'Desfavoritar' : 'Favoritar'}
                      >
                        <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteThread(item);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Excluir interação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Modal
        isOpen={escalateOpen}
        onClose={() => {
          if (!escalating) {
            setEscalateOpen(false);
            setLoadingEscalateList(false);
          }
        }}
        title="Enviar para especialista"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)} disabled={escalating}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmEscalate()} loading={escalating}>
              Continuar em Minhas conversas
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-3">
          Incluímos as últimas mensagens do IAgro neste tópico e ativamos o atendimento humano. Escolha o parceiro; em seguida você será levado a Minhas conversas para dialogar por aqui.
        </p>
        <label className="block text-xs text-muted-foreground mb-1">Agrônomo parceiro</label>
        <select
          className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
          value={escalateAgronomoId}
          onChange={(e) => setEscalateAgronomoId(e.target.value)}
          disabled={loadingEscalateList}
        >
          {loadingEscalateList ? (
            <option value="">Carregando lista de agrônomos…</option>
          ) : agronomosPick.length === 0 ? (
            <option value="">Nenhum agrônomo disponível. Cadastre parceiros ou verifique a página Agrônomos Parceiros.</option>
          ) : (
            agronomosPick.map((a) => (
              <option key={String(a.id)} value={String(a.id)}>
                {a.nome}
                {a.whatsapp ? '' : ' (sem WhatsApp)'}
              </option>
            ))
          )}
        </select>
      </Modal>

      <Modal
        isOpen={Boolean(threadToDelete)}
        onClose={() => {
          if (!deletingThread) setThreadToDelete(null);
        }}
        title="Excluir interação"
        footer={
          <>
            <Button variant="ghost" onClick={() => setThreadToDelete(null)} disabled={deletingThread}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void confirmDeleteThread()} loading={deletingThread}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir a interação
          {threadToDelete?.title ? ` "${threadToDelete.title}"` : ''}?
          <br />
          Essa ação remove a conversa do histórico.
        </p>
      </Modal>

      <EncerrarAtendimentoModal
        isOpen={encerrarModalOpen}
        onClose={() => setEncerrarModalOpen(false)}
        onConfirmSemAvaliacao={() => void encerrarSemAvaliacaoIAgro()}
        onConfirmComAvaliacao={(a) => void encerrarComAvaliacaoIAgro(a)}
        loading={encerrando}
      />
    </div>
  );
}
