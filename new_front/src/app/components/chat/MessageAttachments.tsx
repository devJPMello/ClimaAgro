import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, X } from 'lucide-react';

export type AttachmentItem = { url: string; kind: 'image' | 'pdf' };

type Props = {
  items: AttachmentItem[];
  /** Nomes dos ficheiros na ordem do envio (ligados aos itens pelo tipo). */
  names?: string[];
  align?: 'start' | 'end';
};

/** Abre o ficheiro numa nova aba (data: URLs são bloqueadas pelo navegador, por isso viram blob). */
async function abrirEmNovaAba(url: string) {
  if (url.startsWith('blob:')) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const blob = await fetch(url).then((r) => r.blob());
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function nomesPorTipo(names: string[] = []) {
  const pdfs = names.filter((n) => /\.pdf$/i.test(n));
  const imagens = names.filter((n) => /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(n));
  return { pdfs, imagens };
}

export function PdfCard({ url, name, onDark = false }: { url: string; name?: string; onDark?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void abrirEmNovaAba(url)}
      title="Abrir PDF"
      className={`group flex w-[260px] max-w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        onDark
          ? 'border-white/15 bg-white/5 hover:bg-white/10'
          : 'border-border bg-card hover:bg-muted/60'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-500">
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name || 'Documento PDF'}</span>
        <span className="block text-xs text-muted-foreground">PDF · clique para abrir</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </button>
  );
}

function Lightbox({ url, name, onClose }: { url: string; name?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label={name || 'Imagem'}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={url}
        alt={name || ''}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {name ? <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/80">{name}</p> : null}
    </div>,
    document.body
  );
}

export function ImageTile({ url, name, single }: { url: string; name?: string; single: boolean }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        title={name ? `Ampliar ${name}` : 'Ampliar imagem'}
        className={`overflow-hidden rounded-xl border border-border bg-muted/30 transition-opacity hover:opacity-90 ${
          single ? 'max-w-[260px]' : 'h-[124px] w-[124px]'
        }`}
      >
        <img
          src={url}
          alt={name || 'Imagem enviada'}
          className={single ? 'block max-h-[200px] w-auto object-cover' : 'h-full w-full object-cover'}
        />
      </button>
      {aberta ? <Lightbox url={url} name={name} onClose={() => setAberta(false)} /> : null}
    </>
  );
}

/** Anexos de uma mensagem: imagens em grade (ampliam ao clicar) e PDFs como cartão de ficheiro. */
export function MessageAttachments({ items, names, align = 'end' }: Props) {
  if (items.length === 0) return null;
  const { pdfs: nomesPdf, imagens: nomesImg } = nomesPorTipo(names);
  const imagens = items.filter((i) => i.kind === 'image');
  const pdfs = items.filter((i) => i.kind === 'pdf');

  return (
    <div className={`flex flex-col gap-1.5 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {imagens.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
          {imagens.map((img, i) => (
            <ImageTile key={img.url} url={img.url} name={nomesImg[i]} single={imagens.length === 1} />
          ))}
        </div>
      )}
      {pdfs.map((pdf, i) => (
        <PdfCard key={pdf.url} url={pdf.url} name={nomesPdf[i]} />
      ))}
    </div>
  );
}
