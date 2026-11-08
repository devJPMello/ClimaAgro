import { useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { fetchHybridMediaBlob } from '../../../lib/api/hybridChatApi';

type Props = {
  messageId: string;
  mimeType?: string | null;
  clerkUserId: string;
};

export function HybridMediaAttachment({ messageId, mimeType, clerkUserId }: Props) {
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

  if (falhou) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        Anexo indisponível
      </span>
    );
  }
  if (!url) {
    return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label="Carregando mídia" />;
  }
  if (mimeType?.startsWith('audio')) {
    return <audio controls src={url} className="max-w-[min(100%,280px)] rounded-md" />;
  }
  if (mimeType === 'application/pdf' || mimeType?.includes('pdf')) {
    return (
      <iframe
        title="PDF"
        src={`${url}#toolbar=0&navpanes=0`}
        className="h-52 min-h-[12rem] w-full max-w-[min(100%,280px)] rounded-lg border border-green-700/35 bg-muted/20"
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="max-h-52 max-w-full rounded-lg border border-green-700/35 object-contain"
    />
  );
}
