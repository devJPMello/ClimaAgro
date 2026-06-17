import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Cloud, Handshake, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { HybridMediaAttachment } from '../chat/HybridMediaAttachment';
import { LocalAttachmentThumbnail } from '../chat/LocalAttachmentThumbnail';
import type { UnifiedChatMessage } from '../../../lib/api/hybridChatApi';
import type { ConciergeMeta } from '../../../lib/api/iagroChatApi';
import type { AgronomoParceiroApi } from '../../../lib/api/agronomosParceirosApi';
import { displayUserMessageText, type LocalMediaItem, type QuickAction } from '../../../lib/hooks/useIagroChat';

const MD_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    const isBlock = className?.includes('language-');
    return isBlock ? (
      <code className="block bg-muted rounded-md px-3 py-2 text-xs font-mono overflow-x-auto my-2">
        {children}
      </code>
    ) : (
      <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 font-mono">{children}</pre>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground italic my-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-3" />,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} className="text-primary underline underline-offset-2 hover:text-primary-dark" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1">{children}</td>
  ),
};

interface ConciergeCardProps {
  suggestion: ConciergeMeta;
  indicatedAgronomo: AgronomoParceiroApi | null;
  loadingIndicatedAgronomo: boolean;
  escalating: boolean;
  onAutoEscalate: () => void;
  onOpenEscalateModal: (specialty?: string) => void;
  onDismiss: () => void;
}

function ConciergeCard({
  suggestion,
  indicatedAgronomo,
  loadingIndicatedAgronomo,
  escalating,
  onAutoEscalate,
  onOpenEscalateModal,
  onDismiss,
}: ConciergeCardProps) {
  return (
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
              ) : null}.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-1">
              Não há parceiro cadastrado para esta área ainda. Você ainda pode escolher outro agrônomo na lista.
            </p>
          )}
          <p className="text-muted-foreground text-xs mt-2">
            {suggestion.reason || 'O IAgro entendeu que falar com um agrônomo ajuda neste ponto.'}
            {suggestion.specialtyHint && (
              <span className="block mt-1 text-foreground/90">
                Área: <strong>{suggestion.specialtyHint}</strong>
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="text-xs" onClick={onAutoEscalate} loading={escalating}>
              Encaminhar para {indicatedAgronomo?.nome ?? 'especialista'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => onOpenEscalateModal(suggestion.specialtyHint)}
            >
              Escolher outro agrônomo
            </Button>
            <Button type="button" variant="ghost" className="text-xs" onClick={onDismiss}>
              Dispensar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageAreaProps {
  messages: UnifiedChatMessage[];
  loadingHistory: boolean;
  loadingSend: boolean;
  humanHandoff: boolean;
  messageMediaPreviews: Map<string, LocalMediaItem[]>;
  conciergeSuggestion: ConciergeMeta | null;
  indicatedAgronomo: AgronomoParceiroApi | null;
  loadingIndicatedAgronomo: boolean;
  escalating: boolean;
  userId: string | undefined;
  quickActions: QuickAction[];
  onApplyQuickPrompt: (prompt: string) => void;
  onApplyPlantAnalysis: () => void;
  onAutoEscalateSpecialist: () => void;
  onOpenEscalateModal: (specialty?: string) => void;
  onDismissConcierge: () => void;
}

export function MessageArea({
  messages,
  loadingHistory,
  loadingSend,
  humanHandoff,
  messageMediaPreviews,
  conciergeSuggestion,
  indicatedAgronomo,
  loadingIndicatedAgronomo,
  escalating,
  userId,
  quickActions,
  onApplyQuickPrompt,
  onApplyPlantAnalysis,
  onAutoEscalateSpecialist,
  onOpenEscalateModal,
  onDismissConcierge,
}: MessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingSend]);

  useEffect(() => {
    if (conciergeSuggestion?.escalate) {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [conciergeSuggestion]);

  return (
    <div className="h-[50vh] sm:h-[60vh] md:h-[68vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      {loadingHistory && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}

      {/* Empty state */}
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
            <button
              type="button"
              onClick={onApplyPlantAnalysis}
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    type="button"
                    onClick={() => onApplyQuickPrompt(action.prompt)}
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

      {/* Messages */}
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
                <div className="w-fit max-w-full break-words rounded-lg bg-card border border-border px-3 py-2 text-sm text-card-foreground prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
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
                  {message.hasMidia && userId ? (
                    <div className="rounded-lg border border-green-700/35 bg-green-600/5 p-2">
                      <HybridMediaAttachment
                        messageId={message.id}
                        mimeType={message.midiaMimeType}
                        clerkUserId={userId}
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
                {(messageMediaPreviews.get(message.id) ?? []).map((item) => (
                  <LocalAttachmentThumbnail
                    key={item.url}
                    url={item.url}
                    kind={item.kind}
                    name="Anexo enviado"
                    size="relaxed"
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

      {/* Concierge suggestion */}
      {conciergeSuggestion?.escalate && !loadingHistory && messages.length > 0 && (
        <ConciergeCard
          suggestion={conciergeSuggestion}
          indicatedAgronomo={indicatedAgronomo}
          loadingIndicatedAgronomo={loadingIndicatedAgronomo}
          escalating={escalating}
          onAutoEscalate={onAutoEscalateSpecialist}
          onOpenEscalateModal={onOpenEscalateModal}
          onDismiss={onDismissConcierge}
        />
      )}

      {/* Typing indicators */}
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
  );
}
