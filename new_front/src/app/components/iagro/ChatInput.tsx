import type { ClipboardEvent, FormEvent, RefObject } from 'react';
import { FileText, Loader2, Mic, MicOff, Paperclip, SendHorizonal, X } from 'lucide-react';
import { LocalAttachmentThumbnail } from '../chat/LocalAttachmentThumbnail';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  loadingSend: boolean;
  canSend: boolean;
  isRecording: boolean;
  pendingFiles: File[];
  pendingPreviews: Map<File, string>;
  inputRef: RefObject<HTMLTextAreaElement>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onToggleRecording: () => void;
  onRemovePendingFile: (index: number) => void;
  onOpenAttachmentModal: () => void;
}

export function ChatInput({
  input,
  setInput,
  loadingSend,
  canSend,
  isRecording,
  pendingFiles,
  pendingPreviews,
  inputRef,
  onSubmit,
  onPaste,
  onToggleRecording,
  onRemovePendingFile,
  onOpenAttachmentModal,
}: ChatInputProps) {
  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <div className="w-full space-y-2">
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {pendingFiles.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1 text-xs"
              >
                {pendingPreviews.get(file) ? (
                  <LocalAttachmentThumbnail
                    url={pendingPreviews.get(file)!}
                    kind={file.type === 'application/pdf' ? 'pdf' : 'image'}
                    name={file.name}
                    size="compact"
                  />
                ) : file.type === 'application/pdf' ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                ) : null}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => onRemovePendingFile(index)}
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
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSubmit(e as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Pergunte ao IAgro..."
            rows={1}
            className={[
              'w-full h-14 resize-none overflow-hidden rounded-2xl border bg-input-background',
              'py-4 pr-24 sm:pr-36 pl-12 text-sm leading-5 focus:outline-none focus:ring-0 transition-colors',
              isRecording ? 'border-destructive' : 'border-border',
            ].join(' ')}
          />

          <button
            type="button"
            onClick={onOpenAttachmentModal}
            title="Anexar ficheiros ao IAgro"
            className="absolute left-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Abrir anexos para o IAgro"
          >
            <Paperclip className="w-4 h-4" aria-hidden />
          </button>

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleRecording}
              title={isRecording ? 'Parar gravação' : 'Transcrever áudio'}
              className={[
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                isRecording
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {isRecording ? (
                <MicOff className="w-4 h-4 animate-pulse" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Enviar"
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs text-primary-foreground transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingSend ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SendHorizonal className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
