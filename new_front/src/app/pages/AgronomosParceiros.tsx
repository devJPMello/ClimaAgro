import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import {
  Award,
  Briefcase,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Star,
  User,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { cadastrarAgronomoParceiro, listarAgronomosParceiros } from '../../lib/api/agronomosParceirosApi';
import { escalateToSpecialist } from '../../lib/api/hybridChatApi';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { formatMunicipioComUf, formatUfLabel, UF_NOME } from '../../lib/geo/brazilStatesMalha';

const ESPECIALIDADES_PRINCIPAIS = [
  'Soja e Milho',
  'Horticultura',
  'Café e Frutas',
  'Solos e Nutrição de Plantas',
  'Fitossanidade',
  'Irrigação e Recursos Hídricos',
];
const UF_IBGE_ID_BY_SIGLA: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52',
  MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22',
  RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};

interface Agronomo {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  telefoneFormatado: string;
  municipio: string;
  uf: string;
  crea: string;
  especialidade: string;
  avaliacao: number;
  totalAvaliacoes: number;
  totalAtendimentos: number;
  tempoResposta: string;
  sobre: string;
  areasAtuacao: string[];
}

export function AgronomosParceiros() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [agronomos, setAgronomos] = useState<Agronomo[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [agronomoSelecionado, setAgronomoSelecionado] = useState<Agronomo | null>(null);
  const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [enviandoEspecialista, setEnviandoEspecialista] = useState(false);
  const [busca, setBusca] = useState('');
  const [estadoSelecionado, setEstadoSelecionado] = useState('todos');
  const [municipioSelecionado, setMunicipioSelecionado] = useState('todos');
  const [especialidadeSelecionada, setEspecialidadeSelecionada] = useState('todas');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [cadastro, setCadastro] = useState({
    nome: '',
    email: '',
    whatsapp: '',
    telefoneFormatado: '',
    municipio: '',
    uf: '',
    crea: '',
    especialidade: '',
    sobre: '',
  });

  const PAGE_SIZE = 6;
  const ufIbgeSelecionada = estadoSelecionado === 'todos' ? undefined : UF_IBGE_ID_BY_SIGLA[estadoSelecionado];
  const ufIbgeCadastro = cadastro.uf ? UF_IBGE_ID_BY_SIGLA[cadastro.uf] : undefined;
  const { options: municipiosPorUfOptions, loading: loadingMunicipiosPorUf } = useIbgeMunicipioSelectOptions(ufIbgeSelecionada);
  const { options: municipiosCadastroOptions, loading: loadingMunicipiosCadastro } = useIbgeMunicipioSelectOptions(ufIbgeCadastro);
  const ufOptionsOrdenadas = useMemo(
    () =>
      [...Object.keys(UF_NOME)]
        .sort((a, b) => UF_NOME[a].localeCompare(UF_NOME[b], 'pt-BR'))
        .map((uf) => ({ value: uf, label: formatUfLabel(uf) })),
    []
  );

  useEffect(() => {
    async function carregar() {
      setLoadingLista(true);
      try {
        const response = await listarAgronomosParceiros();
        const normalizados = (response.agronomos || []).map((item): Agronomo => ({
          id: String(item.id),
          nome: item.nome || 'Agrônomo',
          email: item.email || 'email-nao-informado@climaagro.com',
          whatsapp: item.whatsapp || '',
          telefoneFormatado: item.telefoneFormatado || item.telefone || 'Não informado',
          municipio: item.municipio || 'Não informado',
          uf: item.uf || '--',
          crea: item.crea || 'Não informado',
          especialidade: item.especialidade || 'Especialidade não informada',
          avaliacao:
            typeof item.avaliacao === 'number' && !Number.isNaN(item.avaliacao) ? item.avaliacao : 0,
          totalAvaliacoes: typeof item.totalAvaliacoes === 'number' ? item.totalAvaliacoes : 0,
          totalAtendimentos: typeof item.totalAtendimentos === 'number' ? item.totalAtendimentos : 0,
          tempoResposta: item.tempoResposta || 'N/A',
          sobre: item.sobre || 'Profissional parceiro da rede ClimaAgro.',
          areasAtuacao: Array.isArray(item.areasAtuacao) && item.areasAtuacao.length > 0
            ? item.areasAtuacao
            : [item.especialidade || 'Consultoria Agronômica'],
        }));
        setAgronomos(normalizados);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao carregar agrônomos.';
        toast.error(msg);
        setAgronomos([]);
      } finally {
        setLoadingLista(false);
      }
    }
    void carregar();
  }, []);

  const estados = useMemo(
    () => [{ value: 'todos', label: 'Todos os Estados' }, ...ufOptionsOrdenadas],
    [ufOptionsOrdenadas]
  );
  const municipios = useMemo(() => {
    if (estadoSelecionado === 'todos') return ['todos'];
    const ordenados = [...new Set(municipiosPorUfOptions.map((item) => item.value))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return ['todos', ...ordenados];
  }, [estadoSelecionado, municipiosPorUfOptions]);
  const especialidades = useMemo(
    () => ['todas', ...ESPECIALIDADES_PRINCIPAIS],
    []
  );

  useEffect(() => {
    if (municipioSelecionado !== 'todos' && !municipios.includes(municipioSelecionado)) {
      setMunicipioSelecionado('todos');
      setPaginaAtual(1);
    }
  }, [municipioSelecionado, municipios]);

  const agronomosFiltrados = useMemo(
    () =>
      agronomos.filter((item) => {
        const termo = busca.trim().toLowerCase();
        const bateBusca =
          !termo ||
          item.nome.toLowerCase().includes(termo) ||
          item.especialidade.toLowerCase().includes(termo);
        const bateEstado = estadoSelecionado === 'todos' || item.uf === estadoSelecionado;
        const bateMunicipio = municipioSelecionado === 'todos' || item.municipio === municipioSelecionado;
        const bateEspecialidade =
          especialidadeSelecionada === 'todas' || item.especialidade.includes(especialidadeSelecionada);
        return bateBusca && bateEstado && bateMunicipio && bateEspecialidade;
      }),
    [agronomos, busca, estadoSelecionado, municipioSelecionado, especialidadeSelecionada]
  );

  const totalPaginas = Math.max(1, Math.ceil(agronomosFiltrados.length / PAGE_SIZE));
  const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaCorrigida - 1) * PAGE_SIZE;
  const fim = inicio + PAGE_SIZE;
  const agronomosPaginados = agronomosFiltrados.slice(inicio, fim);

  useEffect(() => {
    if (paginaAtual !== paginaCorrigida) setPaginaAtual(paginaCorrigida);
  }, [paginaAtual, paginaCorrigida]);

  function abrirDetalhes(agronomo: Agronomo) {
    setAgronomoSelecionado(agronomo);
    setModalPerfilAberto(true);
  }

  function abrirWhatsapp() {
    if (!agronomoSelecionado) return;
    window.open(`https://wa.me/${agronomoSelecionado.whatsapp}`, '_blank', 'noopener,noreferrer');
  }

  async function enviarParaEspecialista() {
    if (!agronomoSelecionado) return;
    if (!user?.id) {
      toast.error('Faça login para enviar o histórico ao especialista.');
      return;
    }
    let threadId: string | null = null;
    try {
      threadId = sessionStorage.getItem('climaagro.iagro.activeThreadId');
    } catch {
      threadId = null;
    }
    if (!threadId) {
      toast.error('Abra o IAgro, converse com a IA e volte aqui para enviar o histórico.');
      return;
    }
    if (!agronomoSelecionado.whatsapp?.trim()) {
      toast.error('Este agrônomo não possui WhatsApp cadastrado.');
      return;
    }
    setEnviandoEspecialista(true);
    try {
      await escalateToSpecialist(
        {
          threadId,
          whatsappAgronomo: agronomoSelecionado.whatsapp.trim(),
          agronomoParceiroId: agronomoSelecionado.id,
          produtorNome: user.fullName || user.firstName || undefined,
          specialtyFilter: agronomoSelecionado.especialidade,
        },
        user.id
      );
      toast.success('Histórico preparado. Abrindo Minhas conversas.');
      setModalPerfilAberto(false);
      navigate(`/minhas-conversas?thread=${encodeURIComponent(threadId)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Não foi possível preparar o envio.';
      toast.error(msg);
    } finally {
      setEnviandoEspecialista(false);
    }
  }

  function cadastrarAgronomo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !cadastro.nome.trim() ||
      !cadastro.email.trim() ||
      !cadastro.whatsapp.trim() ||
      !cadastro.crea.trim() ||
      !cadastro.especialidade.trim()
    ) {
      toast.error('Preencha os campos obrigatórios para cadastro.');
      return;
    }
    void (async () => {
      try {
        await cadastrarAgronomoParceiro({
          nome: cadastro.nome.trim(),
          email: cadastro.email.trim(),
          whatsapp: cadastro.whatsapp.trim(),
          telefone: cadastro.telefoneFormatado.trim(),
          municipio: cadastro.municipio.trim(),
          uf: cadastro.uf.trim().toUpperCase(),
          crea: cadastro.crea.trim(),
          especialidade: cadastro.especialidade.trim(),
          sobre: cadastro.sobre.trim(),
        });
        toast.success('Cadastro recebido! Em breve entraremos em contato.');
        setModalCadastroAberto(false);
        setCadastro({
          nome: '',
          email: '',
          whatsapp: '',
          telefoneFormatado: '',
          municipio: '',
          uf: '',
          crea: '',
          especialidade: '',
          sobre: '',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Falha ao enviar cadastro.';
        toast.error(msg);
      }
    })();
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Agrônomos Parceiros
        </h1>
        <p className="text-muted-foreground">
          Encontre especialistas certificados para ajudar com suas necessidades agrícolas
        </p>
      </div>

      <Card>
        <CardBody className="rounded-xl border border-border bg-white dark:bg-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 space-y-3">
              <div className="inline-flex items-center gap-2">
                <CheckCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <h2 className="text-lg text-foreground">Programa Agrônomos Parceiros ClimaAgro</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Conectamos produtores a profissionais certificados para consultas técnicas, manejo e tomada de decisão.
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  Profissionais Verificados
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  Atendimento Rápido
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  Especialistas por Região
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Button type="button" onClick={() => setModalCadastroAberto(true)}>
                <UserPlus className="h-4 w-4" />
                Você é Agrônomo? Cadastre-se
              </Button>
              <p className="text-xs text-muted-foreground">Faça parte da nossa rede de parceiros</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPaginaAtual(1);
                }}
                placeholder="Buscar por nome ou especialidade..."
                className="pl-10"
              />
            </div>
            <Select
              value={estadoSelecionado}
              onChange={(e) => {
                setEstadoSelecionado(e.target.value);
                setMunicipioSelecionado('todos');
                setPaginaAtual(1);
              }}
              options={estados}
            />
            <Select
              value={municipioSelecionado}
              onChange={(e) => {
                setMunicipioSelecionado(e.target.value);
                setPaginaAtual(1);
              }}
              options={municipios.map((municipio) => ({
                value: municipio,
                label:
                  municipio === 'todos'
                    ? (estadoSelecionado === 'todos' ? 'Selecione primeiro um estado' : 'Todos os Municípios')
                    : municipio,
              }))}
              disabled={estadoSelecionado === 'todos' || loadingMunicipiosPorUf}
            />
            <Select
              value={especialidadeSelecionada}
              onChange={(e) => {
                setEspecialidadeSelecionada(e.target.value);
                setPaginaAtual(1);
              }}
              options={especialidades.map((esp) => ({
                value: esp,
                label: esp === 'todas' ? 'Todas Especialidades' : esp,
              }))}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <div className="p-5">
          {loadingLista && (
            <p className="text-sm text-muted-foreground">Carregando agrônomos parceiros...</p>
          )}
          {!loadingLista && agronomosFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum agrônomo parceiro encontrado.</p>
          )}
          {!loadingLista && agronomosFiltrados.length > 0 && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {agronomosPaginados.map((agronomo) => (
                <Card
                  key={agronomo.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg"
                  onClick={() => abrirDetalhes(agronomo)}
                >
                  <CardBody className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
                          <User className="h-8 w-8" />
                        </div>
                        <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-green-500">
                          <CheckCircle className="h-3.5 w-3.5 text-white" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg">{agronomo.nome}</p>
                        <p className="text-sm text-muted-foreground">{agronomo.especialidade}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-severity-medium">
                          <Star className="h-4 w-4 fill-current" />
                          {agronomo.totalAvaliacoes > 0 ? (
                            <>
                              {agronomo.avaliacao.toFixed(1)} ({agronomo.totalAvaliacoes} aval.)
                            </>
                          ) : (
                            <span className="text-muted-foreground font-normal">Sem avaliações ainda</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2 min-w-0">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words leading-snug">
                          {formatMunicipioComUf(agronomo.municipio, agronomo.uf)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 min-w-0">
                        <Briefcase className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words leading-snug">{agronomo.crea}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl" style={{ fontFamily: 'var(--font-serif)' }}>
                          {agronomo.totalAtendimentos}
                        </p>
                        <p className="text-xs text-muted-foreground">Atendimentos</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl" style={{ fontFamily: 'var(--font-serif)' }}>
                          {agronomo.tempoResposta}
                        </p>
                        <p className="text-xs text-muted-foreground">Resposta média</p>
                      </div>
                    </div>

                    <Button type="button" className="w-full" onClick={() => abrirDetalhes(agronomo)}>
                      Ver Perfil
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        {!loadingLista &&
          agronomosFiltrados.length > 0 &&
          (() => {
            const WINDOW = 4;
            const half = Math.floor(WINDOW / 2);
            let start = Math.max(1, paginaCorrigida - half);
            const end = Math.min(totalPaginas, start + WINDOW - 1);
            if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
            const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

            return (
              <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {(paginaCorrigida - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginaCorrigida * PAGE_SIZE, agronomosFiltrados.length)} de {agronomosFiltrados.length}{' '}
                  agrônomos
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                    disabled={paginaCorrigida === 1}
                    className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Anterior
                  </button>

                  {start > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaginaAtual(1)}
                        className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                      >
                        1
                      </button>
                      {start > 2 && <span className="px-1 text-muted-foreground select-none">…</span>}
                    </>
                  )}

                  {pageNums.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPaginaAtual(n)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                        n === paginaCorrigida
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  {end < totalPaginas && (
                    <>
                      {end < totalPaginas - 1 && (
                        <span className="px-1 text-muted-foreground select-none">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPaginaAtual(totalPaginas)}
                        className="w-8 h-8 rounded text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                      >
                        {totalPaginas}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaCorrigida === totalPaginas}
                    className="flex items-center gap-1 px-2 h-8 rounded text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Próxima
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })()}
      </Card>

      {agronomoSelecionado && (
        <Modal
          isOpen={modalPerfilAberto}
          onClose={() => setModalPerfilAberto(false)}
          title="Perfil do Agrônomo"
          size="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalPerfilAberto(false)}>
                Fechar
              </Button>
              <Button
                variant="secondary"
                loading={enviandoEspecialista}
                onClick={() => void enviarParaEspecialista()}
              >
                Enviar para Especialista
              </Button>
              <Button onClick={abrirWhatsapp}>
                <MessageCircle className="h-4 w-4" />
                Conversar no WhatsApp
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            <div className="border-b border-border pb-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
                    <User className="h-10 w-10" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-green-500">
                    <CheckCircle className="h-4 w-4 text-white" />
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl" style={{ fontFamily: 'var(--font-serif)' }}>
                    {agronomoSelecionado.nome}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success" className="inline-flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Parceiro Certificado
                    </Badge>
                    <Badge variant="info">{agronomoSelecionado.especialidade}</Badge>
                  </div>
                  <p className="inline-flex items-center gap-1 text-sm text-severity-medium">
                    <Star className="h-4 w-4 fill-current" />
                    {agronomoSelecionado.totalAvaliacoes > 0 ? (
                      <>
                        {agronomoSelecionado.avaliacao.toFixed(1)} ({agronomoSelecionado.totalAvaliacoes}{' '}
                        aval.)
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal">Sem avaliações ainda</span>
                    )}
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                      <span className="min-w-0 break-words leading-snug">
                        {formatMunicipioComUf(agronomoSelecionado.municipio, agronomoSelecionado.uf)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Briefcase className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                      <span className="min-w-0 break-words font-medium text-foreground leading-snug">
                        {agronomoSelecionado.crea}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  Email
                </p>
                <p className="font-medium truncate">{agronomoSelecionado.email}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  WhatsApp
                </p>
                <p className="font-medium">{agronomoSelecionado.telefoneFormatado}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="inline-flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                Sobre
              </h4>
              <p className="text-sm text-muted-foreground">{agronomoSelecionado.sobre}</p>
            </div>

            <div className="space-y-2">
              <h4>Áreas de Atuação</h4>
              <div className="flex flex-wrap gap-2">
                {agronomoSelecionado.areasAtuacao.map((area) => (
                  <Badge key={area}>{area}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-accent/30 p-4 text-center">
                <p className="text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>
                  {agronomoSelecionado.totalAtendimentos}
                </p>
                <p className="text-xs text-muted-foreground">Atendimentos Realizados</p>
              </div>
              <div className="rounded-xl bg-accent/30 p-4 text-center">
                <p className="text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>
                  {agronomoSelecionado.tempoResposta}
                </p>
                <p className="text-xs text-muted-foreground">Tempo de Resposta Médio</p>
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/20">
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-green-800 dark:text-green-300">Converse direto pelo WhatsApp</p>
                  <p className="text-sm text-green-700/90 dark:text-green-400">
                    Tire dúvidas técnicas, compartilhe fotos da lavoura e receba recomendações personalizadas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={modalCadastroAberto}
        onClose={() => setModalCadastroAberto(false)}
        title="Cadastro de Agrônomo Parceiro"
        size="xl"
      >
        <form className="space-y-4" onSubmit={cadastrarAgronomo}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nome"
              value={cadastro.nome}
              onChange={(e) => setCadastro((prev) => ({ ...prev, nome: e.target.value }))}
              required
            />
            <Input
              label="Email"
              type="email"
              value={cadastro.email}
              onChange={(e) => setCadastro((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <Input
              label="WhatsApp (somente números)"
              value={cadastro.whatsapp}
              onChange={(e) => setCadastro((prev) => ({ ...prev, whatsapp: e.target.value }))}
              required
            />
            <Input
              label="Telefone formatado"
              value={cadastro.telefoneFormatado}
              onChange={(e) => setCadastro((prev) => ({ ...prev, telefoneFormatado: e.target.value }))}
            />
            <Select
              label="Município"
              value={cadastro.municipio}
              onChange={(e) => setCadastro((prev) => ({ ...prev, municipio: e.target.value }))}
              options={[
                {
                  value: '',
                  label: !cadastro.uf
                    ? 'Selecione a UF primeiro'
                    : loadingMunicipiosCadastro
                      ? 'Carregando municípios...'
                      : 'Selecione um município',
                },
                ...municipiosCadastroOptions.map((m) => ({ value: m.value, label: m.label })),
              ]}
              disabled={!cadastro.uf || loadingMunicipiosCadastro}
            />
            <Select
              label="UF"
              value={cadastro.uf}
              onChange={(e) => setCadastro((prev) => ({ ...prev, uf: e.target.value }))}
              options={[
                { value: '', label: 'Selecione a UF' },
                ...ufOptionsOrdenadas,
              ]}
            />
            <Input
              label="CREA"
              value={cadastro.crea}
              onChange={(e) => setCadastro((prev) => ({ ...prev, crea: e.target.value }))}
              required
            />
            <Select
              label="Especialidade"
              value={cadastro.especialidade}
              onChange={(e) => setCadastro((prev) => ({ ...prev, especialidade: e.target.value }))}
              options={[
                { value: '', label: 'Selecione uma especialidade' },
                ...ESPECIALIDADES_PRINCIPAIS.map((esp) => ({ value: esp, label: esp })),
              ]}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-muted-foreground">Sobre</label>
            <textarea
              value={cadastro.sobre}
              onChange={(e) => setCadastro((prev) => ({ ...prev, sobre: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalCadastroAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar cadastro</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
