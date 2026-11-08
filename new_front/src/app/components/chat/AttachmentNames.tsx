import { FileText, Image as ImageIcon } from 'lucide-react';

/**
 * Mostra os nomes dos ficheiros enviados ao IAgro quando a pré-visualização não está
 * neste aparelho (ela fica guardada só no navegador onde a mensagem foi enviada).
 */
export function AttachmentNames({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5" title="A pré-visualização fica só no aparelho onde o arquivo foi enviado.">
      {names.map((nome) => {
        const pdf = /\.pdf$/i.test(nome);
        const Icone = pdf ? FileText : ImageIcon;
        return (
          <span
            key={nome}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-foreground"
          >
            <Icone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{nome}</span>
          </span>
        );
      })}
    </div>
  );
}
