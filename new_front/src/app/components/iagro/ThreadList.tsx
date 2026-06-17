import { History, Star, Trash2, X } from 'lucide-react';
import type { IAgroThread } from '../../../lib/api/iagroChatApi';

interface ThreadListProps {
  threads: IAgroThread[];
  threadId: string | null;
  loadingThreads: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onToggleFavorite: (thread: IAgroThread) => void;
  onDeleteThread: (thread: IAgroThread) => void;
}

export function ThreadList({
  threads,
  threadId,
  loadingThreads,
  isOpen,
  onClose,
  onOpenThread,
  onToggleFavorite,
  onDeleteThread,
}: ThreadListProps) {
  return (
    <div className={`fixed inset-0 z-40 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Fechar histórico"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute top-0 right-0 h-full w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg">Histórico de Interações</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="h-[calc(100%-76px)] overflow-y-auto p-4 space-y-2">
          {loadingThreads && (
            <p className="text-sm text-muted-foreground">Carregando conversas...</p>
          )}
          {!loadingThreads && threads.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conversa registrada ainda.</p>
          )}
          {threads.map((item) => (
            <div
              key={item.threadId}
              className={`w-full rounded-lg border px-3 py-2 transition-colors ${
                threadId === item.threadId
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenThread(item.threadId)}
                className="w-full text-left"
              >
                <p className="text-sm text-foreground truncate">{item.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{item.totalMessages} mensagens</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                        item.isFavorite
                          ? 'text-yellow-500 hover:bg-yellow-500/10'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      title={item.isFavorite ? 'Desfavoritar' : 'Favoritar'}
                    >
                      <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteThread(item); }}
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
  );
}
