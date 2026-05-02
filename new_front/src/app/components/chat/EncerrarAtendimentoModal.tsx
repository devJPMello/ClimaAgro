import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export type AvaliacaoEncerramento = { estrelas: number; comentario: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmComAvaliacao: (a: AvaliacaoEncerramento) => void | Promise<void>;
  onConfirmSemAvaliacao: () => void | Promise<void>;
  loading?: boolean;
};

export function EncerrarAtendimentoModal({
  isOpen,
  onClose,
  onConfirmComAvaliacao,
  onConfirmSemAvaliacao,
  loading = false,
}: Props) {
  const [estrelas, setEstrelas] = useState(0);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEstrelas(0);
      setComentario('');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!loading) onClose();
      }}
      title="Encerrar atendimento"
      size="2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void onConfirmSemAvaliacao()}
            loading={loading}
          >
            Encerrar sem avaliar
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onConfirmComAvaliacao({
                estrelas,
                comentario: comentario.trim(),
              })
            }
            disabled={estrelas < 1 || loading}
            loading={loading}
          >
            Encerrar e registrar avaliação
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-none">
        Como foi o atendimento do especialista? Sua nota entra na média exibida no perfil do agrônomo
        parceiro (quanto mais estrelas, mais a média sobe; notas baixas puxam a média para baixo).
      </p>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xs text-muted-foreground mr-2 shrink-0">Nota</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={loading}
              onClick={() => setEstrelas(n)}
              className="p-1 rounded-md transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            >
              <Star
                className={`w-8 h-8 ${
                  n <= estrelas
                    ? 'fill-yellow-400 text-yellow-500'
                    : 'text-muted-foreground/40 fill-transparent'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
      <label className="block text-xs text-muted-foreground mb-1">Comentário (opcional)</label>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        disabled={loading}
        rows={4}
        maxLength={2000}
        placeholder="Conte se o problema foi resolvido, se recomendaria o especialista, sugestões..."
        className="w-full resize-none rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      <p className="text-[10px] text-muted-foreground mt-1">{comentario.length}/2000</p>
    </Modal>
  );
}
