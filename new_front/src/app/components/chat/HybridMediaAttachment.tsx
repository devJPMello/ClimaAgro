import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchHybridMediaBlob } from '../../../lib/api/hybridChatApi';

type Props = {
  messageId: string;
  mimeType?: string | null;
  clerkUserId: string;
};

export function HybridMediaAttachment({ messageId, mimeType, clerkUserId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let blobUrl: string | undefined;
    let cancelled = false;
    void (async () => {
      const blob = await fetchHybridMediaBlob(messageId, clerkUserId);
      if (cancelled || !blob) return;
      blobUrl = URL.createObjectURL(blob);
      setUrl(blobUrl);
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [messageId, clerkUserId]);

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
