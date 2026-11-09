import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchIaAttachmentBlob, type IaAttachmentDto } from '../../../lib/api/iagroChatApi';
import { AttachmentNames } from './AttachmentNames';
import { MessageAttachments, type AttachmentItem } from './MessageAttachments';

type Props = {
  attachments: IaAttachmentDto[];
  clerkUserId: string;
};

function tipoDoAnexo(a: IaAttachmentDto): 'image' | 'pdf' {
  return a.mimeType?.includes('pdf') || /\.pdf$/i.test(a.name || '') ? 'pdf' : 'image';
}

/** Anexos do IAgro guardados no servidor: aparecem em qualquer aparelho em que a pessoa entrar. */
export function ServerAttachments({ attachments, clerkUserId }: Props) {
  const [items, setItems] = useState<AttachmentItem[] | null>(null);
  const chave = attachments.map((a) => `${a.chatId}:${a.index}`).join('|');

  useEffect(() => {
    let cancelado = false;
    const criadas: string[] = [];
    setItems(null);
    void (async () => {
      const blobs = await Promise.all(
        attachments.map((a) => fetchIaAttachmentBlob(a.chatId, a.index, clerkUserId).catch(() => null))
      );
      const prontos: AttachmentItem[] = [];
      blobs.forEach((blob, i) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        criadas.push(url);
        prontos.push({ url, kind: tipoDoAnexo(attachments[i]) });
      });
      if (cancelado) {
        criadas.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setItems(prontos);
    })();
    return () => {
      cancelado = true;
      criadas.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, clerkUserId]);

  const nomes = attachments.map((a) => a.name || '').filter(Boolean);

  if (items === null) {
    return (
      <span className="flex h-[124px] w-[124px] items-center justify-center self-end rounded-xl border border-border bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando anexos" />
      </span>
    );
  }
  if (items.length === 0) return <AttachmentNames names={nomes} />;
  return <MessageAttachments items={items} names={nomes} />;
}
