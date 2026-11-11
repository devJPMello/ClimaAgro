import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { BookOpen, Check, Pencil, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { criarRegistro, type TipoRegistro } from '../../../lib/api/diarioApi';
import { gravarDecisao, impressaoDaProposta, lerDecisoes, type AnotacaoProposta, type Decisao } from '../../../lib/diario/anotacaoIagro';
import { formataData, rotuloTipo, TIPOS_REGISTRO } from '../../../lib/diario/formatacao';
import { useClimateUfs } from '../../../lib/hooks/useClimateUfs';
import { formatUfLabel } from '../../../lib/geo/brazilStatesMalha';

type Props = {
  proposta: AnotacaoProposta;
  clerkUserId: string;
};

/** Cartão sob a resposta do IAgro: a anotação só é gravada no Diário de Campo depois do Confirmar. */
export function CartaoAnotacaoDiario({ proposta, clerkUserId }: Props) {
  const { ufs } = useClimateUfs();
  const [dados, setDados] = useState<AnotacaoProposta>(proposta);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [decisao, setDecisao] = useState<Decisao | null>(() => lerDecisoes()[impressaoDaProposta(proposta)] ?? null);

  const ufOptions = useMemo(
    () => [
      { value: '', label: 'Escolher um estado' },
      ...ufs
        .map((u) => String(u.value || '').trim().toUpperCase())
        .filter((v) => /^[A-Z]{2}$/.test(v))
        .map((v) => ({ value: v, label: formatUfLabel(v) })),
    ],
    [ufs]
  );

  const podeConfirmar = /^[A-Z]{2}$/.test(dados.uf) && dados.observacao.trim().length > 0 && !salvando;

  async function confirmar() {
    setSalvando(true);
    try {
      await criarRegistro(clerkUserId, { ...dados, fotos: [] });
      gravarDecisao(proposta, 'salvo');
      setDecisao('salvo');
      toast.success('Anotado no Diário de Campo.');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Não foi possível anotar no diário.');
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    gravarDecisao(proposta, 'cancelado');
    setDecisao('cancelado');
  }

  if (decisao === 'salvo') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Check className="h-4 w-4 text-green-600" aria-hidden />
        Anotado no Diário de Campo.
        <Link to="/diario" className="text-primary underline">
          Ver diário
        </Link>
      </div>
    );
  }
  if (decisao === 'cancelado') {
    return <p className="mt-2 text-xs text-muted-foreground">Anotação cancelada.</p>;
  }

  return (
    <div className="mt-2 w-full max-w-xl rounded-lg border border-primary/30 bg-card p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
        <BookOpen className="h-4 w-4" aria-hidden />
        Anotação para o Diário de Campo — confirme para gravar
      </p>

      {editando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Data" type="date" value={dados.data} onChange={(e) => setDados({ ...dados, data: e.target.value })} />
            <Select
              label="Tipo"
              value={dados.tipo}
              options={TIPOS_REGISTRO}
              onChange={(e) => setDados({ ...dados, tipo: e.target.value as TipoRegistro })}
            />
            <Input label="Cultura" value={dados.cultura} maxLength={60} onChange={(e) => setDados({ ...dados, cultura: e.target.value })} />
            <Input label="Município" value={dados.municipio} maxLength={80} onChange={(e) => setDados({ ...dados, municipio: e.target.value })} />
          </div>
          <Select label="Estado" value={dados.uf} options={ufOptions} onChange={(e) => setDados({ ...dados, uf: e.target.value })} />
          <div className="space-y-1.5">
            <label className="block text-sm" htmlFor="anotacao-obs">
              Observação
            </label>
            <textarea
              id="anotacao-obs"
              rows={3}
              maxLength={2000}
              value={dados.observacao}
              onChange={(e) => setDados({ ...dados, observacao: e.target.value })}
              className="w-full rounded-lg border border-border bg-input-background px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p>
            <span className="font-medium">{rotuloTipo(dados.tipo)}</span> · {formataData(dados.data)}
          </p>
          <p className="text-xs text-muted-foreground">
            {[dados.cultura, dados.municipio, dados.uf ? formatUfLabel(dados.uf) : null].filter(Boolean).join(' · ') || 'Sem local informado'}
          </p>
          <p className="whitespace-pre-wrap">{dados.observacao}</p>
          {!dados.uf && (
            <p className="text-xs text-destructive">O estado não está no seu perfil: toque em Editar para escolher.</p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className="text-xs" onClick={() => void confirmar()} loading={salvando} disabled={!podeConfirmar}>
          <Check className="h-4 w-4" />
          Confirmar
        </Button>
        <Button type="button" variant="secondary" className="text-xs" onClick={() => setEditando((v) => !v)}>
          <Pencil className="h-4 w-4" />
          {editando ? 'Concluir edição' : 'Editar'}
        </Button>
        <Button type="button" variant="ghost" className="text-xs" onClick={cancelar}>
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
