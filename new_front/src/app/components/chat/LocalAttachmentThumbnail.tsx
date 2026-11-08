import { FileText } from 'lucide-react';

type LocalAttachmentKind = 'image' | 'pdf';

type Props = {
  url: string;
  kind: LocalAttachmentKind;
  name: string;
  /** `compact`: faixa de anexos antes de enviar (40×40). `relaxed`: bolha do usuário após envio. */
  size?: 'compact' | 'relaxed';
};

const compactBox = 'h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border';
const relaxedBox = 'max-h-52 w-full max-w-[min(100%,280px)] overflow-hidden rounded-xl border border-white/20 shadow-sm';

/**
 * Miniatura local (blob URL) para imagem ou PDF, mesmo padrão visual em ambos os modos.
 */
export function LocalAttachmentThumbnail({ url, kind, name, size = 'compact' }: Props) {
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt={name}
        className={size === 'compact' ? `${compactBox} object-cover` : 'max-h-52 max-w-full rounded-xl border border-white/20 object-contain shadow-sm'}
      />
    );
  }

  const inner =
    size === 'compact' ? (
      <span className="flex h-full w-full items-center justify-center bg-red-500/15 text-red-500" aria-hidden>
        <FileText className="h-5 w-5" />
      </span>
    ) : (
      <iframe
        title={name}
        src={`${url}#toolbar=0&navpanes=0`}
        className="h-48 w-full min-h-[12rem] border-0 bg-muted/30"
        loading="lazy"
      />
    );

  return (
    <div
      className={size === 'compact' ? `${compactBox} bg-muted/30` : `${relaxedBox} bg-primary-foreground/5`}
    >
      {inner}
    </div>
  );
}

export type { LocalAttachmentKind };
