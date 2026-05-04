import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Cloud } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export type FileAttachmentPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description: ReactNode;
  accept: string;
  /** Quando true, o utilizador pode escolher vários ficheiros de uma vez. */
  multiple?: boolean;
  onFilesSelected: (files: FileList | null) => void;
};

/**
 * Modal padrão do projeto para escolher ficheiros (clique, teclado ou arrastar e largar).
 */
export function FileAttachmentPickerModal({
  isOpen,
  onClose,
  title = 'Anexar ficheiro',
  description,
  accept,
  multiple = false,
  onFilesSelected,
}: FileAttachmentPickerModalProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="mb-4 text-sm text-muted-foreground">{description}</div>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        onChange={(ev) => {
          onFilesSelected(ev.target.files);
          ev.target.value = '';
        }}
      />
      <div
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-border bg-muted/25 hover:border-primary/50 hover:bg-muted/40',
        ].join(' ')}
        role="button"
        aria-label="Zona para soltar ficheiros ou abrir o seletor"
        tabIndex={0}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const next = ev.relatedTarget as Node | null;
          if (next && ev.currentTarget.contains(next)) return;
          setDragOver(false);
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setDragOver(false);
          if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
            onFilesSelected(ev.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Cloud className="h-10 w-10 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Arraste o ficheiro para aqui</p>
          <p className="mt-1 text-xs text-muted-foreground">ou clique na área para escolher no dispositivo</p>
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        <Button
          type="button"
          variant="secondary"
          onClick={(ev) => {
            ev.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Escolher ficheiro{multiple ? 's' : ''}
        </Button>
      </div>
    </Modal>
  );
}
