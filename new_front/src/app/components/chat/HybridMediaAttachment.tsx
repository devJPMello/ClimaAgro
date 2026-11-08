import { useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { fetchHybridMediaBlob } from '../../../lib/api/hybridChatApi';
import { ImageTile, PdfCard } from './MessageAttachments';

type Props = {
  messageId: string;
  mimeType?: string | null;
  clerkUserId: string;
  align?: 'start' | 'end';
};

/** Ficheiro do atendimento com agrônomo (guardado no servidor), no mesmo visual dos anexos do IAgro. */
export function HybridMediaAttachment({ messageId, mimeType, clerkUserId, align = 'end' }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let blobUrl: string | undefined;
    let cancelled = false;
    setFalhou(false);
    void (async () => {
      const blob = await fetchHybridMediaBlob(messageId, clerkUserId).catch(() => null);
      if (cancelled) return;
      if (!blob) {
        setFalhou(true);
        return;
      }
      blobUrl = URL.createObjectURL(blob);
      setUrl(blobUrl);
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [messageId, clerkUserId]);

  const wrap = align === 'end' ? 'self-end' : 'self-start';

  if (falhou) {
    return (
      <span className={`${wrap} inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground`}>
        <Paperclip className="h-3.5 w-3.5" />
        Anexo indisponível
      </span>
    );
  }
  if (!url) {
    return (
      <span className={`${wrap} flex h-[124px] w-[124px] items-center justify-center rounded-xl border border-border bg-muted/30`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando anexo" />
      </span>
    );
  }
  if (mimeType?.startsWith('audio')) {
    return <audio controls src={url} className={`${wrap} max-w-[min(100%,280px)] rounded-md`} />;
  }
  if (mimeType?.includes('pdf')) {
    return (
      <div className={wrap}>
        <PdfCard url={url} />
      </div>
    );
  }
  return (
    <div className={wrap}>
      <ImageTile url={url} single />
    </div>
  );
}
