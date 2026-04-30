import { FormEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Cloud, History, Loader2, Paperclip, SendHorizonal, Sprout, Star, Trash2, TriangleAlert, TrendingUp, X } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import {
  deleteIAgroThread,
  getIAgroHistory,
  listIAgroThreads,
  sendIAgroMessage,
  toggleIAgroThreadFavorite,
  type IAgroMessage,
  type IAgroThread,
} from '../../lib/api/iagroChatApi';

export function IAgro() {
  const [threads, setThreads] = useState<IAgroThread[]>([]);
  const [messages, setMessages] = useState<IAgroMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<IAgroThread | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  async function refreshThreads() {
    setLoadingThreads(true);
    try {
      const response = await listIAgroThreads();
      setThreads(response.threads || []);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function openThread(nextThreadId: string) {
    setLoadingHistory(true);
    try {
      const response = await getIAgroHistory(nextThreadId);
      setThreadId(nextThreadId);
      setMessages(response.messages || []);
      setHistoryOpen(false);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void refreshThreads();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messageText = input.trim();
    if (!messageText && pendingFiles.length === 0) return;

    const optimistic: IAgroMessage = {
      id: `tmp-${Date.now()}`,
      sender: 'user',
      text: messageText || 'Arquivos anexados',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setLoadingSend(true);

    try {
      const response = await sendIAgroMessage({ message: messageText, threadId, files: pendingFiles });
      const assistant: IAgroMessage = {
        id: `tmp-assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.response,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistant]);

      if (!threadId || threadId !== response.threadId) {
        setThreadId(response.threadId);
      }
      await refreshThreads();
      setPendingFiles([]);
    } finally {
      setLoadingSend(false);
    }
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files].slice(0, 6));
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function applyQuickPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  async function handleToggleFavorite(targetThread: IAgroThread) {
    await toggleIAgroThreadFavorite(targetThread.threadId, !targetThread.isFavorite);
    await refreshThreads();
  }

  function handleDeleteThread(targetThread: IAgroThread) {
    setThreadToDelete(targetThread);
  }

  async function confirmDeleteThread() {
    if (!threadToDelete) return;
    setDeletingThread(true);
    try {
      await deleteIAgroThread(threadToDelete.threadId);
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

  return (
    <div className="space-y-6 relative">
      <div className="pr-16">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          IAgro
        </h1>
        <p className="text-muted-foreground">Chat geral com histórico completo das conversas anteriores.</p>
      </div>

      <button
        type="button"
        onClick={() => setHistoryOpen((prev) => !prev)}
        className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center text-foreground transition-all hover:-translate-y-0.5 z-30"
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
                <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
                  <img src="/favicon.png" alt="IAgro" className="h-12 w-12 object-contain" />
                </div>
                <h2 className="text-center text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                  Olá! Como posso ajudar?
                </h2>
                <p className="mx-auto max-w-3xl text-center text-muted-foreground">
                  Sou seu assistente especializado em monitoramento climático e produtividade agrícola.
                  <br />
                  Posso ajudar com:
                </p>

                <div className="mx-auto mt-6 grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
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
            )}
            {messages.map((message) => (
              <div key={message.id} className={`${message.sender === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
                {message.sender === 'assistant' ? (
                  <div className="flex items-end gap-2 max-w-[78%]">
                    <img src="/favicon.png" alt="IAgro" className="h-8 w-8 object-contain shrink-0" />
                    <div className="w-fit max-w-full break-words rounded-lg bg-card border border-border px-3 py-2 text-sm text-card-foreground prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
                ) : (
                  <div className="w-fit max-w-[78%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ml-auto bg-primary text-primary-foreground">
                    {message.text}
                  </div>
                )}
              </div>
            ))}
            {loadingSend && (
              <div className="flex justify-start">
                <div className="flex items-end gap-2 max-w-[78%]">
                  <img src="/favicon.png" alt="IAgro" className="h-8 w-8 object-contain shrink-0 animate-pulse" />
                  <div className="w-fit max-w-full rounded-lg bg-card border border-border px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Gerando resposta...
                  </div>
                </div>
              </div>
            )}
          </div>

          <form className="space-y-2" onSubmit={handleSubmit}>
            <div className="w-full space-y-2">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (canSend) {
                        void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
                      }
                    }
                  }}
                  placeholder="Digite sua pergunta para o IAgro..."
                  rows={1}
                  className="w-full h-14 resize-none overflow-hidden rounded-2xl border border-border bg-input-background py-4 pr-28 pl-12 text-sm leading-5 focus:outline-none focus:ring-0 focus:border-border"
                />
                <label className="absolute left-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,.txt,.csv,.json,.md,.pdf,.doc,.docx"
                    onChange={(event) => {
                      handleFilesSelected(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                  <Paperclip className="w-4 h-4" />
                </label>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="absolute right-3 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 text-xs text-primary-foreground transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingSend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
                  Enviar
                </button>
              </div>
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs">
                      {file.name}
                      <button type="button" onClick={() => removePendingFile(index)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

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
    </div>
  );
}
