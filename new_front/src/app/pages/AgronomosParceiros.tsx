import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import {
  Award,
  Briefcase,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Star,
  Upload,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Tooltip } from '../components/ui/Tooltip';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { cadastrarAgronomoParceiro, listarAgronomosParceiros } from '../../lib/api/agronomosParceirosApi';
import { escalateToSpecialist } from '../../lib/api/hybridChatApi';
import { notifyWhatsappDelivery } from '../../lib/whatsappNotify';
import { scanCreaCarteira } from '../../lib/api/agronomistOnboardingApi';
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

const PRIVACY_POLICY_URL = (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim() ?? '';

function onlyCpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

function formatCpfMask(digits: string): string {
  const d = onlyCpfDigits(digits);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function isValidCpf11(digits: string): boolean {
  const s = onlyCpfDigits(digits);
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += parseInt(s.charAt(i), 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(s.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += parseInt(s.charAt(i), 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(s.charAt(10), 10);
}

function maskEmail(email: string): string {
  const s = email.trim();
  if (!s) return '—';
  const lower = s.toLowerCase();
  if (lower.includes('email-nao-informado') || lower.includes('nao-informado')) return s;
  const i = s.indexOf('@');
  if (i < 1) return s;
  const local = s.slice(0, i);
  const domain = s.slice(i + 1);
  if (!domain) return s;
  const maskedLocal = local.length === 1 ? `${local}***` : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useUser();
  const [agronomos, setAgronomos] = useState<Agronomo[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [agronomoSelecionado, setAgronomoSelecionado] = useState<Agronomo | null>(null);
  const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [cadastroStep, setCadastroStep] = useState<'upload' | 'form'>('upload');
  const [scanningCrea, setScanningCrea] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enviandoEspecialista, setEnviandoEspecialista] = useState(false);
  const [enviandoCadastro, setEnviandoCadastro] = useState(false);
  const [iagroThreadId, setIagroThreadId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [estadoSelecionado, setEstadoSelecionado] = useState('todos');
  const [municipioSelecionado, setMunicipioSelecionado] = useState('todos');
  const [especialidadeSelecionada, setEspecialidadeSelecionada] = useState('todas');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [cadastro, setCadastro] = useState({
    nome: '',
    email: '',
    cpf: '',
    whatsapp: '',
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

  const carregarLista = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    const esp = searchParams.get('especialidade');
    if (!esp) return;
    const found = ESPECIALIDADES_PRINCIPAIS.find((e) => e === esp);
    if (found) {
      setEspecialidadeSelecionada(found);
      setPaginaAtual(1);
    }
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete('especialidade');
      return n;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modalPerfilAberto) {
      setIagroThreadId(null);
      return;
    }
    try {
      setIagroThreadId(sessionStorage.getItem('climaagro.iagro.activeThreadId'));
    } catch {
      setIagroThreadId(null);
    }
  }, [modalPerfilAberto]);

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

  const filtrosAtivos = useMemo(
    () =>
      busca.trim() !== '' ||
      estadoSelecionado !== 'todos' ||
      municipioSelecionado !== 'todos' ||
      especialidadeSelecionada !== 'todas',
    [busca, estadoSelecionado, municipioSelecionado, especialidadeSelecionada]
  );

  function limparFiltros() {
    setBusca('');
    setEstadoSelecionado('todos');
    setMunicipioSelecionado('todos');
    setEspecialidadeSelecionada('todas');
    setPaginaAtual(1);
  }

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
          item.especialidade.toLowerCase().includes(termo) ||
          item.crea.toLowerCase().includes(termo) ||
          item.municipio.toLowerCase().includes(termo) ||
          item.areasAtuacao.some((a) => a.toLowerCase().includes(termo));
        const bateEstado = estadoSelecionado === 'todos' || item.uf === estadoSelecionado;
        const bateMunicipio = municipioSelecionado === 'todos' || item.municipio === municipioSelecionado;
        const bateEspecialidade =
          especialidadeSelecionada === 'todas' || item.especialidade.includes(especialidadeSelecionada);
        return bateBusca && bateEstado && bateMunicipio && bateEspecialidade;
      }),
    [agronomos, busca, estadoSelecionado, municipioSelecionado, especialidadeSelecionada]
  );

  const escalacaoBloqueio = useMemo(() => {
    if (!agronomoSelecionado || !modalPerfilAberto) return null as string | null;
    if (!user?.id) return 'Faça login para enviar o histórico ao especialista.';
    if (!iagroThreadId?.trim()) {
      return 'Abra o IAgro, converse com a IA e volte aqui para enviar o histórico.';
    }
    if (!agronomoSelecionado.whatsapp?.trim()) return 'Este agrônomo não possui WhatsApp cadastrado.';
    return null;
  }, [agronomoSelecionado, modalPerfilAberto, user?.id, iagroThreadId]);

  const podeEscalarParaEspecialista = escalacaoBloqueio === null && !!agronomoSelecionado && modalPerfilAberto;

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
      const out = await escalateToSpecialist(
        {
          threadId,
          whatsappAgronomo: agronomoSelecionado.whatsapp.trim(),
          agronomoParceiroId: agronomoSelecionado.id,
          produtorNome: user.fullName || user.firstName || undefined,
          specialtyFilter: agronomoSelecionado.especialidade,
        },
        user.id
      );
      notifyWhatsappDelivery(out.whatsapp);
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

  function abrirCadastro() {
    setCadastroStep('upload');
    setCadastro({
      nome: '',
      email: '',
      cpf: '',
      whatsapp: '',
      municipio: '',
      uf: '',
      crea: '',
      especialidade: '',
      sobre: '',
    });
    setModalCadastroAberto(true);
  }

  async function handleCreaFile(file: File) {
    setScanningCrea(true);
    try {
      const res = await scanCreaCarteira(file);
      const { extracted } = res.data;
      setCadastro((prev) => ({
        ...prev,
        nome: extracted.fullName ?? prev.nome,
        crea: extracted.creaRegistrationNumber ?? prev.crea,
        uf: extracted.creaUf ?? prev.uf,
        cpf: extracted.cpf ? onlyCpfDigits(extracted.cpf) : prev.cpf,
      }));
      if (res.data.warnings?.length) toast.info(res.data.warnings[0]);
      setCadastroStep('form');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ler a carteira. Preencha manualmente.');
      setCadastroStep('form');
    } finally {
      setScanningCrea(false);
    }
  }

  function cadastrarAgronomo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !cadastro.nome.trim() ||
      !cadastro.email.trim() ||
      !cadastro.cpf.trim() ||
      !cadastro.whatsapp.trim() ||
      !cadastro.crea.trim() ||
      !cadastro.especialidade.trim()
    ) {
      toast.error('Preencha os campos obrigatórios para cadastro.');
      return;
    }
    if (!isValidCpf11(cadastro.cpf)) {
      toast.error('CPF inválido. Verifique os 11 dígitos.');
      return;
    }
    if (!/^\d{10,13}$/.test(cadastro.whatsapp.trim())) {
      toast.error('WhatsApp inválido. Use somente dígitos com DDD (ex: 63999999999).');
      return;
    }
    void (async () => {
      setEnviandoCadastro(true);
      try {
        await cadastrarAgronomoParceiro({
          nome: cadastro.nome.trim(),
          email: cadastro.email.trim(),
          cpf: onlyCpfDigits(cadastro.cpf),
          whatsapp: cadastro.whatsapp.trim(),
          municipio: cadastro.municipio.trim(),
          uf: cadastro.uf.trim().toUpperCase(),
          crea: cadastro.crea.trim(),
          especialidade: cadastro.especialidade.trim(),
          sobre: cadastro.sobre.trim(),
        });
        toast.success(
          'Cadastro recebido! Em breve entraremos em contato. Após aprovação da equipe, o perfil poderá aparecer nesta lista.'
        );
        setModalCadastroAberto(false);
        setCadastro({
          nome: '',
          email: '',
          cpf: '',
          whatsapp: '',
          municipio: '',
          uf: '',
          crea: '',
          especialidade: '',
          sobre: '',
        });
        await carregarLista();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Falha ao enviar cadastro.';
        toast.error(msg);
      } finally {
        setEnviandoCadastro(false);
      }
    })();
  }

  async function copiarEmailAgronomo() {
    if (!agronomoSelecionado?.email?.trim()) return;
    try {
      await navigator.clipboard.writeText(agronomoSelecionado.email.trim());
      toast.success('Email copiado para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente se precisar.');
    }
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
              <Button type="button" onClick={abrirCadastro}>
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
                placeholder="Nome, especialidade, CREA, município ou área de atuação..."
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
        <CardBody className="space-y-4 p-5">
          {!loadingLista && agronomos.length > 0 && (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {filtrosAtivos ? (
                <>
                  Mostrando <strong className="text-foreground">{agronomosFiltrados.length}</strong> de{' '}
                  <strong className="text-foreground">{agronomos.length}</strong> agrônomo
                  {agronomos.length === 1 ? '' : 's'} com os filtros atuais.
                </>
              ) : (
                <>
                  <strong className="text-foreground">{agronomos.length}</strong> agrônomo
                  {agronomos.length === 1 ? '' : 's'} na rede.
                </>
              )}
            </p>
          )}

          {loadingLista && (
            <div
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              aria-busy="true"
              aria-label="A carregar lista de agrônomos"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse space-y-3 rounded-xl border border-border bg-card px-5 py-4"
                >
                  <div className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />
                    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                      <div className="h-4 w-4/5 max-w-[14rem] rounded bg-muted" />
                      <div className="h-3 w-full rounded bg-muted" />
                      <div className="h-3 w-2/3 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="space-y-2 pl-0.5">
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-3/5 rounded bg-muted" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="h-14 rounded-lg bg-muted/80" />
                    <div className="h-14 rounded-lg bg-muted/80" />
                  </div>
                  <div className="h-10 w-full rounded-lg bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!loadingLista && agronomos.length === 0 && (
            <EmptyState
              icon={Users}
              title="Ainda não há parceiros cadastrados"
              description="Quando existirem agrônomos aprovados na rede, eles aparecerão aqui. Se você é agrônomo, use o botão «Você é Agrônomo? Cadastre-se» acima."
            />
          )}

          {!loadingLista && agronomos.length > 0 && agronomosFiltrados.length === 0 && (
            <EmptyState
              icon={Search}
              title="Nenhum resultado com os filtros atuais"
              description="Experimente outros termos de busca, estado, município ou especialidade — ou limpe os filtros para voltar a ver todos."
              action={
                <Button type="button" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              }
            />
          )}

          {!loadingLista && agronomosFiltrados.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agronomosPaginados.map((agronomo) => (
                <Card
                  key={agronomo.id}
                  className="transition-all duration-200 hover:shadow-md"
                >
                  <CardBody className="!px-5 !py-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
                          <User className="h-7 w-7" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-green-500">
                          <CheckCircle className="h-3 w-3 text-white" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-tight">{agronomo.nome}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{agronomo.especialidade}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-severity-medium">
                          <Star className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
                          {agronomo.totalAvaliacoes > 0 ? (
                            <>
                              {agronomo.avaliacao.toFixed(1)} ({agronomo.totalAvaliacoes} aval.)
                            </>
                          ) : (
                            <span className="font-normal text-muted-foreground">Sem avaliações ainda</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                      <div className="flex min-w-0 items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words leading-snug">
                          {formatMunicipioComUf(agronomo.municipio, agronomo.uf)}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <Briefcase className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words leading-snug">{agronomo.crea}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                        <p className="text-lg font-medium leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
                          {agronomo.totalAtendimentos}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Atendimentos</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                        <p className="text-base font-medium leading-tight" style={{ fontFamily: 'var(--font-serif)' }}>
                          {agronomo.tempoResposta}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Resposta média</p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="h-10 w-full"
                      onClick={() => abrirDetalhes(agronomo)}
                    >
                      Ver Perfil
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </CardBody>

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
              <div
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3 sm:px-6 text-sm text-muted-foreground"
                role="navigation"
                aria-label="Paginação da lista de agrônomos"
              >
                <span>
                  {(paginaCorrigida - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginaCorrigida * PAGE_SIZE, agronomosFiltrados.length)} de {agronomosFiltrados.length}{' '}
                  agrônomos
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                    disabled={paginaCorrigida === 1}
                    aria-label="Página anterior"
                    className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>

                  {start > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaginaAtual(1)}
                        aria-label="Ir para a página 1"
                        className="h-8 w-8 rounded text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        1
                      </button>
                      {start > 2 && <span className="select-none px-1 text-muted-foreground">…</span>}
                    </>
                  )}

                  {pageNums.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPaginaAtual(n)}
                      aria-label={`Ir para a página ${n}`}
                      aria-current={n === paginaCorrigida ? 'page' : undefined}
                      className={`h-8 w-8 rounded text-sm font-medium transition-colors ${
                        n === paginaCorrigida
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  {end < totalPaginas && (
                    <>
                      {end < totalPaginas - 1 && (
                        <span className="select-none px-1 text-muted-foreground">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPaginaAtual(totalPaginas)}
                        aria-label={`Ir para a página ${totalPaginas}`}
                        className="h-8 w-8 rounded text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        {totalPaginas}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaCorrigida === totalPaginas}
                    aria-label="Página seguinte"
                    className="flex h-8 items-center gap-1 rounded px-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="hidden sm:inline">Próxima</span>
                    <ChevronRight className="h-4 w-4" aria-hidden />
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
              {escalacaoBloqueio ? (
                <Tooltip content={escalacaoBloqueio} position="top">
                  <span className="inline-flex">
                    <Button
                      variant="secondary"
                      loading={enviandoEspecialista}
                      disabled={!podeEscalarParaEspecialista}
                      title={!podeEscalarParaEspecialista ? escalacaoBloqueio : undefined}
                      onClick={() => void enviarParaEspecialista()}
                    >
                      Enviar para Especialista
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="secondary"
                  loading={enviandoEspecialista}
                  disabled={!podeEscalarParaEspecialista}
                  onClick={() => void enviarParaEspecialista()}
                >
                  Enviar para Especialista
                </Button>
              )}
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
                    <Badge variant="info" className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      Parceiro na rede ClimaAgro
                    </Badge>
                    <Badge variant="default">{agronomoSelecionado.especialidade}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Perfis listados após revisão cadastral; a plataforma não substitui a fiscalização do CREA/CONFEA.
                  </p>
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

            <div
              className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
              role="note"
            >
              <p className="mb-1 font-medium text-foreground">Enviar para especialista</p>
              <p>
                Encaminha o histórico da conversa <strong>ativa no IAgro</strong> (neste navegador) para o WhatsApp
                deste agrônomo. É preciso estar <strong>logado</strong> e ter usado o IAgro nesta sessão; caso
                contrário, o botão fica indisponível (passe o cursor sobre o botão para ver o motivo).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-4 w-4" aria-hidden />
                  Email
                </p>
                <p className="break-all font-medium text-foreground">{maskEmail(agronomoSelecionado.email)}</p>
                {agronomoSelecionado.email &&
                  !agronomoSelecionado.email.toLowerCase().includes('email-nao-informado') && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 h-9 px-2 text-sm"
                      onClick={() => void copiarEmailAgronomo()}
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                      Copiar email completo
                    </Button>
                  )}
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
        {cadastroStep === 'upload' ? (
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-foreground">Envie a foto da sua carteira do CREA</p>
              <p className="text-sm text-muted-foreground">
                Extraímos seus dados automaticamente. Você poderá revisar antes de salvar.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCreaFile(file);
              }}
            />
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Button
                type="button"
                loading={scanningCrea}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {scanningCrea ? 'Lendo carteira...' : 'Selecionar imagem'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCadastroStep('form')}
              >
                Preencher manualmente
              </Button>
            </div>
            <p className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
              Ao enviar foto ou PDF da carteira CREA, você autoriza o processamento automático só para extração dos
              dados de cadastro.{' '}
              {PRIVACY_POLICY_URL ? (
                <a
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                >
                  Política de Privacidade
                </a>
              ) : (
                <span>
                  Os dados são tratados em conformidade com a LGPD, exclusivamente para validação e contato da equipe
                  ClimaAgro.
                </span>
              )}
            </p>
          </div>
        ) : (
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
                label="CPF"
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
                value={formatCpfMask(cadastro.cpf)}
                onChange={(e) =>
                  setCadastro((prev) => ({ ...prev, cpf: onlyCpfDigits(e.target.value) }))
                }
                helperText="11 dígitos. Pode ser preenchido automaticamente ao enviar a foto da carteira CREA."
                required
              />
              <Input
                label="WhatsApp (somente dígitos, com DDD)"
                placeholder="Ex: 63999999999"
                inputMode="numeric"
                maxLength={13}
                value={cadastro.whatsapp}
                onChange={(e) =>
                  setCadastro((prev) => ({ ...prev, whatsapp: e.target.value.replace(/\D/g, '') }))
                }
                helperText="DDD + número, sem espaços ou traços (ex: 63999999999)"
                required
              />
              <Select
                label="UF"
                value={cadastro.uf}
                onChange={(e) => setCadastro((prev) => ({ ...prev, uf: e.target.value, municipio: '' }))}
                options={[
                  { value: '', label: 'Selecione a UF' },
                  ...ufOptionsOrdenadas,
                ]}
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
            <div className="flex justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCadastroStep('upload')}>
                ← Voltar
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setModalCadastroAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={enviandoCadastro}>
                  Salvar cadastro
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
