import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Cloud, Loader2 } from 'lucide-react';
import { MessageAttachments } from '../chat/MessageAttachments';
import { AttachmentNames } from '../chat/AttachmentNames';
import { ServerAttachments } from '../chat/ServerAttachments';
import { CartaoAnotacaoDiario } from './CartaoAnotacaoDiario';
import type { IAgroMessage } from '../../../lib/api/iagroChatApi';
import { attachmentNamesFromText, displayUserMessageText, type LocalMediaItem, type QuickAction } from '../../../lib/hooks/useIagroChat';

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

interface MessageAreaProps {
  messages: IAgroMessage[];
  loadingHistory: boolean;
  loadingSend: boolean;
  messageMediaPreviews: Map<string, LocalMediaItem[]>;
  userId: string | undefined;
  quickActions: QuickAction[];
  onApplyQuickPrompt: (prompt: string) => void;
  onApplyPlantAnalysis: () => void;
}

export function MessageArea({
  messages,
  loadingHistory,
  loadingSend,
  messageMediaPreviews,
  userId,
  quickActions,
  onApplyQuickPrompt,
  onApplyPlantAnalysis,
}: MessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingSend]);

  return (
    <div className="h-[calc(100dvh-19rem)] min-h-[300px] sm:h-[60vh] md:h-[68vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      {loadingHistory && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}

      {/* Empty state */}
      {!loadingHistory && messages.length === 0 && (
        <div className="px-2 py-6">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-sidebar-primary">
            <Cloud className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-center text-2xl sm:text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
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
              className="w-full rounded-2xl border-2 border-dashed border-green-500/40 bg-green-500/5 px-4 py-4 sm:px-6 sm:py-5 text-left transition-all hover:border-green-500/70 hover:bg-green-500/10 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <span className="inline-flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-green-500/15 text-green-600">
                  <Camera className="h-6 w-6 sm:h-7 sm:w-7" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-foreground">Analisar Planta com Foto</p>
                  <p className="text-sm text-muted-foreground line-clamp-3 sm:line-clamp-none">
                    Envie uma foto da sua cultura e receba um laudo agronômico completo: deficiências nutricionais, necessidade de calagem, pragas, doenças e recomendações de manejo.
                  </p>
                </div>
                <span className="hidden sm:inline-flex shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700">
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
                    className="rounded-xl border border-border bg-card px-4 py-3 sm:px-5 sm:py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
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
                  {message.anotacao && userId && (
                    <CartaoAnotacaoDiario proposta={message.anotacao} clerkUserId={userId} />
                  )}
                </div>
              </div>
            ) : (
              <div className="w-fit max-w-[78%] ml-auto flex flex-col items-end gap-1">
                {messageMediaPreviews.get(message.id)?.length ? (
                  <MessageAttachments
                    items={messageMediaPreviews.get(message.id) ?? []}
                    names={attachmentNamesFromText(message.text)}
                  />
                ) : message.attachments?.length && userId ? (
                  <ServerAttachments attachments={message.attachments} clerkUserId={userId} />
                ) : (
                  <AttachmentNames names={attachmentNamesFromText(message.text)} />
                )}
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

      {/* Typing indicators */}
      {loadingSend && (
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
      <div ref={messagesEndRef} />
    </div>
  );
}
