import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { BookOpen, CloudRain, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  apagarRegistro,
  baixarFoto,
  climaDoRegistro,
  criarRegistro,
  listarRegistros,
  type ClimaDoRegistro,
  type RegistroDiario,
  type TipoRegistro,
} from '../../lib/api/diarioApi';
import { descreveClima, formataData, rotuloTipo, TIPOS_REGISTRO } from '../../lib/diario/formatacao';
import { useClimateUfs } from '../../lib/hooks/useClimateUfs';
import { useProfileUf } from '../../lib/hooks/useProfileUf';
import { formatUfLabel } from '../../lib/geo/brazilStatesMalha';

const MAX_FOTOS = 3;
const MAX_FOTO_MB = 5;

function hojeLocalIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

function FotoDoRegistro({ clerkUserId, registroId, index, nome }: { clerkUserId: string; registroId: string; index: number; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let criada: string | null = null;
    void baixarFoto(clerkUserId, registroId, index)
      .then((blob) => {
        if (cancelado) return;
        if (!blob) {
          setFalhou(true);
          return;
        }
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      })
      .catch(() => !cancelado && setFalhou(true));
    return () => {
      cancelado = true;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [clerkUserId, registroId, index]);

  if (falhou) {
    return <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-muted/40 text-[10px] text-muted-foreground">indisponível</span>;
  }
  if (!url) {
    return (
      <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando foto" />
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={nome}>
      <img src={url} alt={nome} className="h-20 w-20 rounded-lg border border-border object-cover" />
    </a>
  );
}

function ClimaDoRegistroView({ clima }: { clima: ClimaDoRegistro }) {
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{clima.janelaDias} dias antes:</span> {descreveClima(clima.antes)}.
      </p>
      <p>
        <span className="font-medium text-foreground">{clima.janelaDias} dias depois:</span>{' '}
        {clima.depois ? `${descreveClima(clima.depois)}.` : 'ainda não há dados (o registro é recente).'}
      </p>
      <p>Clima médio do estado ({clima.uf}), a partir da base do ClimaAgro.</p>
    </div>
  );
}

export function DiarioCampo() {
  const { user } = useUser();
  const clerkUserId = user?.id ?? '';
  const { ufs: ufsApi } = useClimateUfs();
  const profileUf = useProfileUf();

  const [data, setData] = useState(hojeLocalIso());
  const [tipo, setTipo] = useState<TipoRegistro>('observacao');
  const [cultura, setCultura] = useState('');
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [observacao, setObservacao] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [registros, setRegistros] = useState<RegistroDiario[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [climas, setClimas] = useState<Record<string, ClimaDoRegistro | 'carregando'>>({});
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const ufOptions = useMemo(
    () => [
      { value: '', label: 'Escolher um estado' },
      ...ufsApi
        .map((u) => String(u.value || '').trim().toUpperCase())
        .filter((v) => /^[A-Z]{2}$/.test(v))
        .map((v) => ({ value: v, label: formatUfLabel(v) })),
    ],
    [ufsApi]
  );

  useEffect(() => {
    if (profileUf) setUf((atual) => atual || profileUf);
  }, [profileUf]);

  const carregar = useCallback(async () => {
    if (!clerkUserId) return;
    try {
      setRegistros(await listarRegistros(clerkUserId));
      setErroLista(null);
    } catch (e) {
      setErroLista(mensagemDeErro(e, 'Não foi possível carregar o diário.'));
    }
  }, [clerkUserId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function escolherFotos(lista: FileList | null) {
    const novas = Array.from(lista ?? []);
    if (novas.some((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))) {
      toast.error('Envie apenas fotos (JPG, PNG ou WebP).');
      return;
    }
    if (novas.some((f) => f.size > MAX_FOTO_MB * 1024 * 1024)) {
      toast.error(`Cada foto pode ter no máximo ${MAX_FOTO_MB} MB.`);
      return;
    }
    if (novas.length > MAX_FOTOS) {
      toast.error(`Escolha no máximo ${MAX_FOTOS} fotos.`);
      return;
    }
    setFotos(novas);
  }

  async function salvar() {
    setSalvando(true);
    try {
      await criarRegistro(clerkUserId, { data, tipo, cultura, uf, municipio, observacao, fotos });
      toast.success('Registro salvo no diário.');
      setObservacao('');
      setCultura('');
      setMunicipio('');
      setFotos([]);
      await carregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível salvar o registro.'));
    } finally {
      setSalvando(false);
    }
  }

  async function verClima(id: string) {
    setClimas((c) => ({ ...c, [id]: 'carregando' }));
    try {
      const clima = await climaDoRegistro(clerkUserId, id);
      setClimas((c) => ({ ...c, [id]: clima }));
    } catch (e) {
      setClimas((c) => {
        const { [id]: _removido, ...resto } = c;
        return resto;
      });
      toast.error(mensagemDeErro(e, 'Não foi possível consultar o clima.'));
    }
  }

  async function apagar(id: string) {
    try {
      await apagarRegistro(clerkUserId, id);
      setConfirmandoId(null);
      toast.success('Registro apagado.');
      await carregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível apagar o registro.'));
    }
  }

  const podeSalvar = Boolean(data && tipo && /^[A-Z]{2}$/.test(uf)) && !salvando;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Diário de Campo
        </h1>
        <p className="text-muted-foreground">
          Registre o que acontece na lavoura (plantio, adubação, aplicações, pragas, colheita) e veja o clima da semana anterior e da posterior a cada registro.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo registro</CardTitle>
          <CardDescription>Fica visível só para você e é apagado junto com a sua conta.</CardDescription>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Data" type="date" value={data} max={hojeLocalIso()} onChange={(e) => setData(e.target.value)} />
            <Select
              label="Tipo de registro"
              value={tipo}
              options={TIPOS_REGISTRO}
              onChange={(e) => setTipo(e.target.value as TipoRegistro)}
            />
            <Input label="Cultura (opcional)" placeholder="Soja" value={cultura} maxLength={60} onChange={(e) => setCultura(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="Estado" value={uf} options={ufOptions} onChange={(e) => setUf(e.target.value)} />
            <Input label="Município (opcional)" value={municipio} maxLength={80} onChange={(e) => setMunicipio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-foreground" htmlFor="diario-observacao">
              Observação
            </label>
            <textarea
              id="diario-observacao"
              rows={3}
              maxLength={2000}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="O que foi feito ou observado, produtos usados, área, sintomas..."
              className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-foreground" htmlFor="diario-fotos">
              Fotos (opcional, até {MAX_FOTOS}, {MAX_FOTO_MB} MB cada)
            </label>
            <label
              htmlFor="diario-fotos"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm hover:bg-accent"
            >
              <ImagePlus className="h-4 w-4" />
              {fotos.length ? `${fotos.length} foto(s) escolhida(s)` : 'Escolher fotos'}
            </label>
            <input
              id="diario-fotos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => escolherFotos(e.target.files)}
            />
            {fotos.length > 0 && <p className="text-xs text-muted-foreground">{fotos.map((f) => f.name).join(', ')}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            O diário é um registro pessoal e não substitui a orientação de um profissional habilitado. Aplicações de defensivos exigem receituário agronômico.
          </p>
          <Button type="button" onClick={() => void salvar()} loading={salvando} disabled={!podeSalvar}>
            <BookOpen className="h-4 w-4" />
            Salvar registro
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>
          Seus registros
        </h2>
        {erroLista && <p className="text-sm text-destructive">{erroLista}</p>}
        {registros === null && !erroLista && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </p>
        )}
        {registros?.length === 0 && (
          <Card>
            <CardBody>
              <EmptyState
                icon={BookOpen}
                title="Nenhum registro ainda"
                description="Use o formulário acima para anotar a primeira atividade da lavoura."
              />
            </CardBody>
          </Card>
        )}
        {registros?.map((r) => {
          const clima = climas[r.id];
          return (
            <Card key={r.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{rotuloTipo(r.tipo)}</Badge>
                  <span className="text-sm font-medium tabular-nums">{formataData(r.data)}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.cultura, r.municipio, r.uf].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {r.observacao && <p className="mt-2 whitespace-pre-wrap text-sm">{r.observacao}</p>}
                {r.anexos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.anexos.map((a, i) => (
                      <FotoDoRegistro key={i} clerkUserId={clerkUserId} registroId={r.id} index={i} nome={a.nome} />
                    ))}
                  </div>
                )}
                {clima && clima !== 'carregando' && <ClimaDoRegistroView clima={clima} />}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    onClick={() => void verClima(r.id)}
                    loading={clima === 'carregando'}
                  >
                    <CloudRain className="h-4 w-4" />
                    {clima && clima !== 'carregando' ? 'Atualizar clima' : 'Ver clima do período'}
                  </Button>
                  {confirmandoId === r.id ? (
                    <>
                      <Button type="button" variant="danger" className="text-xs" onClick={() => void apagar(r.id)}>
                        Confirmar exclusão
                      </Button>
                      <Button type="button" variant="ghost" className="text-xs" onClick={() => setConfirmandoId(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" className="text-xs" onClick={() => setConfirmandoId(r.id)}>
                      <Trash2 className="h-4 w-4" />
                      Apagar
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
