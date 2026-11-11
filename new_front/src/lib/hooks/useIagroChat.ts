import { type ClipboardEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { Cloud, Sprout, TriangleAlert, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';
import {
  deleteIAgroThread,
  getIAgroHistory,
  listIAgroThreads,
  sendIAgroMessage,
  toggleIAgroThreadFavorite,
  type IAgroMessage,
  type IAgroThread,
} from '../api/iagroChatApi';
import { iagroThreadImagesKey } from '../storage/storageKeys';

export type LocalMediaItem = { url: string; kind: 'image' | 'pdf' };

export type QuickAction = {
  title: string;
  description: string;
  prompt: string;
  icon: ComponentType<{ className?: string }>;
};

export const IAGRO_QUICK_ACTIONS: QuickAction[] = [
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

const IAGRO_MAX_FILE_BYTES = 8 * 1024 * 1024;

function validateIAgroFiles(files: File[]): { valid: File[]; rejected: string[] } {
  const valid: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (file.size > IAGRO_MAX_FILE_BYTES) {
      rejected.push(`"${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) — máx. 8 MB`);
      continue;
    }
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isText = /^text\//.test(file.type) || file.type === 'application/json';
    const isDoc =
      file.type === 'application/msword' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const allowedByExt = ['md', 'csv', 'txt', 'json'].includes(ext);
    if (!isImage && !isPdf && !isText && !isDoc && !allowedByExt) {
      rejected.push(`"${file.name}" — tipo de ficheiro não suportado`);
      continue;
    }
    valid.push(file);
  }
  return { valid, rejected };
}

export function displayUserMessageText(raw: string): string {
  return String(raw || '').replace(/\n*\[Anexos:[^\]]+\]\s*$/i, '').trimEnd();
}

/** Nomes dos ficheiros guardados no fim da mensagem ("[Anexos: a.jpg, b.pdf]"). */
export function attachmentNamesFromText(raw: string): string[] {
  const m = /\[Anexos:\s*([^\]]+)\]\s*$/i.exec(String(raw || ''));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function useIagroChat() {
  const { user } = useUser();

  const [threads, setThreads] = useState<IAgroThread[]>([]);
  const [messages, setMessages] = useState<IAgroMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<Map<File, string>>(new Map());
  const [messageMediaPreviews, setMessageMediaPreviews] = useState<Map<string, LocalMediaItem[]>>(new Map());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<IAgroThread | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);
  const [iagroAttachmentModalOpen, setIagroAttachmentModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const canSend = (input.trim().length > 0 || pendingFiles.length > 0) && !loadingSend;

  // ─── private helpers ────────────────────────────────────────────────────────

  function buildMessageImageKey(text: string): string {
    return String(text || '').trim();
  }

  function dataUrlToLocalKind(dataUrl: string): 'image' | 'pdf' {
    return dataUrl.startsWith('data:application/pdf') ? 'pdf' : 'image';
  }

  function buildPersistedUserText(messageText: string, files: File[]): string {
    const fileNames = files.map((f) => f.name).filter(Boolean);
    if (fileNames.length === 0) return messageText;
    return `${messageText || 'Arquivos enviados'}\n\n[Anexos: ${fileNames.join(', ')}]`;
  }

  function loadCachedThreadImages(targetId: string): Record<string, string[]> {
    try {
      const raw = localStorage.getItem(iagroThreadImagesKey(targetId));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed as Record<string, string[]>;
    } catch {
      return {};
    }
  }

  function saveCachedThreadImages(targetId: string, key: string, images: string[]) {
    if (!targetId || !key || images.length === 0) return;
    try {
      const cache = loadCachedThreadImages(targetId);
      cache[key] = images;
      localStorage.setItem(iagroThreadImagesKey(targetId), JSON.stringify(cache));
    } catch {
      toast.warning('Não foi possível manter todas as imagens no cache local.');
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  // ─── thread management ──────────────────────────────────────────────────────

  async function refreshThreads() {
    const uid = user?.id;
    if (!uid) { setThreads([]); return; }
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
      if (!user?.id) {
        toast.error('Faça login para abrir o histórico de conversas.');
        setMessages([]);
        setThreadId(null);
        return;
      }
      const history = await getIAgroHistory(nextThreadId, user.id);
      const list = history.messages || [];
      setThreadId(nextThreadId);
      setMessages(list);
      const cachedImages = loadCachedThreadImages(nextThreadId);
      const hydrated = new Map<string, LocalMediaItem[]>();
      for (const msg of list) {
        if (msg.sender !== 'user') continue;
        const key = buildMessageImageKey(msg.text);
        const found = cachedImages[key];
        if (Array.isArray(found) && found.length > 0) {
          hydrated.set(msg.id, found.map((url) => ({ url, kind: dataUrlToLocalKind(url) })));
        }
      }
      setMessageMediaPreviews(hydrated);
      setHistoryOpen(false);
    } finally {
      setLoadingHistory(false);
    }
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
      }
      setThreadToDelete(null);
      await refreshThreads();
    } finally {
      setDeletingThread(false);
    }
  }

  // ─── file handling ──────────────────────────────────────────────────────────

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const { valid, rejected } = validateIAgroFiles(files);
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `Ficheiro rejeitado: ${rejected[0]}`
          : `${rejected.length} ficheiros rejeitados:\n${rejected.slice(0, 3).join('\n')}`,
        { duration: 6000 },
      );
    }
    if (valid.length === 0) return;
    const newPreviews = new Map(pendingPreviews);
    valid.forEach((f) => {
      if (f.type.startsWith('image/') || f.type === 'application/pdf') {
        newPreviews.set(f, URL.createObjectURL(f));
      }
    });
    setPendingPreviews(newPreviews);
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 6));
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

  // ─── send message ───────────────────────────────────────────────────────────

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recognitionRef.current?.stop();
    const messageText = input.trim();
    if (!messageText && pendingFiles.length === 0) return;

    if (!user?.id) {
      toast.error('Faça login para conversar com o IAgro.');
      return;
    }

    const localItems: LocalMediaItem[] = [];
    for (const f of pendingFiles) {
      const url = pendingPreviews.get(f);
      if (!url) continue;
      if (f.type.startsWith('image/')) localItems.push({ url, kind: 'image' });
      else if (f.type === 'application/pdf') localItems.push({ url, kind: 'pdf' });
    }

    const hasImage = pendingFiles.some((f) => f.type.startsWith('image/'));
    const hasPdf = pendingFiles.some((f) => f.type === 'application/pdf');
    let attachHint = 'Arquivos anexados';
    if (hasImage && hasPdf) attachHint = 'Imagem e PDF enviados para análise';
    else if (hasImage) attachHint = 'Imagem enviada para análise';
    else if (hasPdf) attachHint = 'PDF enviado para análise';

    const optimisticId = `tmp-${Date.now()}`;
    if (localItems.length > 0) {
      setMessageMediaPreviews((prev) => new Map(prev).set(optimisticId, localItems));
    }

    const filesToSend = [...pendingFiles];
    const persistedUserText = buildPersistedUserText(messageText, filesToSend);
    const cacheableFiles = pendingFiles.filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    const filteredMediaDataUrls = (
      await Promise.all(cacheableFiles.map(async (f) => fileToDataUrl(f).catch(() => '')))
    ).filter(Boolean);

    const keepBlobUrls = new Set(localItems.map((x) => x.url));
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, sender: 'user', text: messageText || attachHint, createdAt: new Date().toISOString() },
    ]);
    setInput('');
    pendingPreviews.forEach((url) => { if (!keepBlobUrls.has(url)) URL.revokeObjectURL(url); });
    setPendingFiles([]);
    setPendingPreviews(new Map());
    setLoadingSend(true);

    try {
      const response = await sendIAgroMessage({ message: messageText, threadId, files: filesToSend }, user.id);
      setMessages((prev) => [
        ...prev,
        {
          id: `tmp-assistant-${Date.now()}`,
          sender: 'assistant',
          text: response.response,
          anotacao: response.anotacao ?? null,
          createdAt: new Date().toISOString(),
        },
      ]);
      if (!threadId || threadId !== response.threadId) setThreadId(response.threadId);
      if (filteredMediaDataUrls.length > 0) {
        saveCachedThreadImages(response.threadId, buildMessageImageKey(persistedUserText), filteredMediaDataUrls);
      }
      await refreshThreads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      // Devolve o texto ao campo para o usuário tentar de novo sem redigitar.
      setInput((atual) => atual || messageText);
    } finally {
      setLoadingSend(false);
    }
  }

  // ─── quick prompts ──────────────────────────────────────────────────────────

  function applyQuickPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function applyPlantAnalysis() {
    setInput(
      'Analise a imagem desta planta: identifique o estado de saúde, possíveis deficiências nutricionais, sinais de pragas ou doenças, necessidade de calagem, e me dê recomendações práticas de manejo.',
    );
    setIagroAttachmentModalOpen(true);
  }

  // ─── voice recording ─────────────────────────────────────────────────────────

  function toggleRecording() {
    if (isRecording) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { toast.error('Reconhecimento de voz não suportado. Use Chrome ou Edge.'); return; }
    const recognition = new SR();
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
      setInput(Array.from(e.results).map((r) => r[0].transcript).join(''));
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  // ─── effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { void refreshThreads(); }, [user?.id]);

  return {
    // state
    threads, messages, threadId,
    input, setInput,
    loadingSend, loadingThreads, loadingHistory,
    pendingFiles, pendingPreviews, messageMediaPreviews,
    historyOpen, setHistoryOpen,
    threadToDelete, setThreadToDelete, deletingThread,
    iagroAttachmentModalOpen, setIagroAttachmentModalOpen,
    isRecording,
    // computed
    canSend,
    // refs
    inputRef,
    // handlers
    openThread,
    handleSubmit,
    handleFilesSelected,
    removePendingFile,
    handlePaste,
    applyQuickPrompt,
    applyPlantAnalysis,
    handleToggleFavorite,
    handleDeleteThread,
    confirmDeleteThread,
    toggleRecording,
    // user
    user,
  };
}
