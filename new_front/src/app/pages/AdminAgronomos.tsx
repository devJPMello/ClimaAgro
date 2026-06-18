import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  CheckCircle,
  Edit2,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { ApiError } from '../../lib/api/errors';
import {
  listarAdminAgronomos,
  criarAdminAgronomo,
  atualizarAdminAgronomo,
  excluirAdminAgronomo,
  type AdminAgronomo,
  type AdminAgronomoStatus,
} from '../../lib/api/adminAgronomosApi';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { UF_NOME, formatUfLabel } from '../../lib/geo/brazilStatesMalha';

const ESPECIALIDADES = [
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

const FORM_EMPTY = {
  nome: '',
  email: '',
  whatsapp: '',
  especialidade: '',
  cpf: '',
  telefone: '',
  uf: '',
  municipio: '',
  crea: '',
};

type FormState = typeof FORM_EMPTY;

type ConfirmAction =
  | { tipo: 'aprovar'; agronomo: AdminAgronomo }
  | { tipo: 'desativar'; agronomo: AdminAgronomo }
  | { tipo: 'excluir'; agronomo: AdminAgronomo };

function iniciais(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function formatarData(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '');
}

export function AdminAgronomos() {
  const { user } = useUser();
  const clerkUserId = user?.id ?? '';

  const [agronomos, setAgronomos] = useState<AdminAgronomo[]>([]);
  const [loading, setLoading] = useState(true);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<AdminAgronomoStatus>('todos');
  const [busca, setBusca] = useState('');

  const [modalFormAberto, setModalFormAberto] = useState(false);
  const [agronomoEditando, setAgronomoEditando] = useState<AdminAgronomo | null>(null);
  const [form, setForm] = useState<FormState>(FORM_EMPTY);
  const [salvando, setSalvando] = useState(false);

  const [confirmacao, setConfirmacao] = useState<ConfirmAction | null>(null);
  const [executandoAcao, setExecutandoAcao] = useState(false);

  const ufIbgeForm = form.uf ? UF_IBGE_ID_BY_SIGLA[form.uf] : undefined;
  const { options: municipiosOptions, loading: loadingMunicipios } = useIbgeMunicipioSelectOptions(ufIbgeForm);

  const ufOptions = useMemo(
    () => [
      { value: '', label: 'Selecione o estado' },
      ...Object.keys(UF_NOME)
        .sort((a, b) => UF_NOME[a].localeCompare(UF_NOME[b], 'pt-BR'))
        .map((uf) => ({ value: uf, label: formatUfLabel(uf) })),
    ],
    []
  );

  const municipioSelectOptions = useMemo(
    () => [
      { value: '', label: loadingMunicipios ? 'Carregando...' : 'Selecione o município' },
      ...municipiosOptions,
    ],
    [municipiosOptions, loadingMunicipios]
  );

  const especialidadeOptions = useMemo(
    () => [
      { value: '', label: 'Selecione a especialidade' },
      ...ESPECIALIDADES.map((e) => ({ value: e, label: e })),
    ],
    []
  );

  const carregar = useCallback(async () => {
    if (!clerkUserId) return;
    setLoading(true);
    try {
      const data = await listarAdminAgronomos(clerkUserId, 'todos');
      setAgronomos(data.agronomos ?? []);
      setAcessoNegado(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAcessoNegado(true);
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao carregar agrônomos.');
      }
    } finally {
      setLoading(false);
    }
  }, [clerkUserId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const listaMostrada = useMemo(() => {
    let lista = agronomos;
    if (statusFiltro === 'pendente') lista = lista.filter((a) => !a.parceiroAtivo);
    else if (statusFiltro === 'ativo') lista = lista.filter((a) => a.parceiroAtivo);
    if (!busca.trim()) return lista;
    const q = busca.toLowerCase();
    return lista.filter(
      (a) =>
        a.nome.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.especialidade ?? '').toLowerCase().includes(q) ||
        (a.crea ?? '').toLowerCase().includes(q)
    );
  }, [agronomos, statusFiltro, busca]);

  const contadores = useMemo(
    () => ({
      todos: agronomos.length,
      pendente: agronomos.filter((a) => !a.parceiroAtivo).length,
      ativo: agronomos.filter((a) => a.parceiroAtivo).length,
    }),
    [agronomos]
  );

  function abrirModalAdicionar() {
    setAgronomoEditando(null);
    setForm(FORM_EMPTY);
    setModalFormAberto(true);
  }

  function abrirModalEditar(ag: AdminAgronomo) {
    setAgronomoEditando(ag);
    setForm({
      nome: ag.nome ?? '',
      email: ag.email ?? '',
      whatsapp: ag.whatsapp ?? '',
      especialidade: ag.especialidade ?? '',
      cpf: '',
      telefone: ag.telefone ?? '',
      uf: ag.uf ?? '',
      municipio: ag.municipio ?? '',
      crea: ag.crea ?? '',
    });
    setModalFormAberto(true);
  }

  function fecharModal() {
    setModalFormAberto(false);
    setAgronomoEditando(null);
    setForm(FORM_EMPTY);
  }

  function setField(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((prev) => ({
        ...prev,
        [field]: value,
        ...(field === 'uf' ? { municipio: '' } : {}),
      }));
    };
  }

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim() || !form.whatsapp.trim() || !form.especialidade) {
      toast.error('Preencha os campos obrigatórios: nome, e-mail, WhatsApp e especialidade.');
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: onlyDigits(form.whatsapp),
        especialidade: form.especialidade,
        cpf: form.cpf.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        uf: form.uf || undefined,
        municipio: form.municipio || undefined,
        crea: form.crea.trim() || undefined,
      };

      if (agronomoEditando) {
        await atualizarAdminAgronomo(clerkUserId, agronomoEditando.id, payload);
        toast.success('Agrônomo atualizado com sucesso.');
      } else {
        await criarAdminAgronomo(clerkUserId, payload);
        toast.success('Agrônomo cadastrado e ativado com sucesso.');
      }
      fecharModal();
      void carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function executarConfirmacao() {
    if (!confirmacao) return;
    setExecutandoAcao(true);
    try {
      const { tipo, agronomo } = confirmacao;
      if (tipo === 'excluir') {
        await excluirAdminAgronomo(clerkUserId, agronomo.id);
        toast.success('Agrônomo removido.');
      } else if (tipo === 'desativar') {
        await atualizarAdminAgronomo(clerkUserId, agronomo.id, { parceiroAtivo: false });
        toast.success('Agrônomo desativado.');
      } else if (tipo === 'aprovar') {
        await atualizarAdminAgronomo(clerkUserId, agronomo.id, { parceiroAtivo: true });
        toast.success('Agrônomo aprovado e ativado.');
      }
      setConfirmacao(null);
      void carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao executar ação.');
    } finally {
      setExecutandoAcao(false);
    }
  }

  if (acessoNegado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Shield className="w-14 h-14 text-muted-foreground" />
        <h2 className="text-xl text-foreground">Acesso não autorizado</h2>
        <p className="text-muted-foreground max-w-sm">
          Essa área é restrita a administradores do ClimaAgro. Se você acredita que deveria ter acesso, entre em contato com o suporte.
        </p>
      </div>
    );
  }

  const TABS: { label: string; value: AdminAgronomoStatus; count: number }[] = [
    { label: 'Todos', value: 'todos', count: contadores.todos },
    { label: 'Pendentes', value: 'pendente', count: contadores.pendente },
    { label: 'Ativos', value: 'ativo', count: contadores.ativo },
  ];

  const labelConfirm: Record<string, { titulo: string; descricao: string; btn: string; variante: 'danger' | 'primary' }> = {
    excluir: {
      titulo: 'Remover agrônomo',
      descricao: 'O agrônomo será removido da plataforma. Essa ação pode ser desfeita recadastrando-o.',
      btn: 'Remover',
      variante: 'danger',
    },
    desativar: {
      titulo: 'Desativar agrônomo',
      descricao: 'O agrônomo ficará invisível para os produtores mas continuará no sistema. Você pode reativá-lo a qualquer momento.',
      btn: 'Desativar',
      variante: 'danger',
    },
    aprovar: {
      titulo: 'Aprovar agrônomo',
      descricao: 'O agrônomo será listado na plataforma e ficará visível para todos os produtores.',
      btn: 'Aprovar',
      variante: 'primary',
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl text-foreground">Gestão de Agrônomos Parceiros</h1>
          <p className="text-sm text-muted-foreground mt-1">Aprove, edite e gerencie os agrônomos da plataforma.</p>
        </div>
        <Button onClick={abrirModalAdicionar} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Adicionar agrônomo
        </Button>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFiltro(tab.value)}
              className={`px-4 py-1.5 rounded-md text-sm transition-all ${
                statusFiltro === tab.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  statusFiltro === tab.value ? 'bg-primary/10 text-primary' : 'bg-border text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : listaMostrada.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <UserCheck className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {busca ? 'Nenhum resultado para a busca.' : 'Nenhum agrônomo neste filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listaMostrada.map((ag) => (
            <Card key={ag.id}>
              <CardBody className="p-4">
                <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-medium">
                    {iniciais(ag.nome)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-foreground font-medium">{ag.nome}</span>
                      <Badge variant={ag.parceiroAtivo ? 'success' : 'medium'}>
                        {ag.parceiroAtivo ? 'Ativo' : 'Pendente'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{ag.email}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {ag.especialidade && <span>{ag.especialidade}</span>}
                      {ag.uf && <span>{ag.uf}{ag.municipio ? ` · ${ag.municipio}` : ''}</span>}
                      {ag.crea && <span>CREA: {ag.crea}</span>}
                      {ag.whatsapp && <span>WhatsApp: {ag.whatsapp}</span>}
                      {ag.avaliacao != null && (
                        <span>⭐ {ag.avaliacao} ({ag.totalAvaliacoes ?? 0} aval.)</span>
                      )}
                      <span>Cadastrado: {formatarData(ag.createdAt)}</span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {!ag.parceiroAtivo && (
                      <Button
                        variant="secondary"
                        className="gap-1 text-xs py-1.5 px-3"
                        onClick={() => setConfirmacao({ tipo: 'aprovar', agronomo: ag })}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Aprovar
                      </Button>
                    )}
                    {ag.parceiroAtivo && (
                      <Button
                        variant="secondary"
                        className="gap-1 text-xs py-1.5 px-3"
                        onClick={() => setConfirmacao({ tipo: 'desativar', agronomo: ag })}
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Desativar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="gap-1 text-xs py-1.5 px-3"
                      onClick={() => abrirModalEditar(ag)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="gap-1 text-xs py-1.5 px-3 text-destructive hover:text-destructive"
                      onClick={() => setConfirmacao({ tipo: 'excluir', agronomo: ag })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Adicionar / Editar */}
      <Modal
        isOpen={modalFormAberto}
        onClose={fecharModal}
        title={agronomoEditando ? `Editar — ${agronomoEditando.nome}` : 'Adicionar agrônomo'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={fecharModal} disabled={salvando}>
              Cancelar
            </Button>
            <Button form="form-agronomo" type="submit" loading={salvando}>
              {agronomoEditando ? 'Salvar alterações' : 'Cadastrar e ativar'}
            </Button>
          </>
        }
      >
        <form id="form-agronomo" onSubmit={(e) => void handleSubmitForm(e)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome completo *"
              value={form.nome}
              onChange={setField('nome')}
              placeholder="Ex.: Dr. João Mendes"
              required
            />
            <Input
              label="E-mail *"
              type="email"
              value={form.email}
              onChange={setField('email')}
              placeholder="joao@email.com"
              required
              disabled={!!agronomoEditando}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="WhatsApp * (somente números)"
              value={form.whatsapp}
              onChange={(e) => setForm((p) => ({ ...p, whatsapp: onlyDigits(e.target.value) }))}
              placeholder="5563999990000"
              helperText="DDI + DDD + número, ex.: 5563999990000"
              required
            />
            <Input
              label="Telefone"
              value={form.telefone}
              onChange={setField('telefone')}
              placeholder="(63) 3333-4444"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Especialidade *"
              value={form.especialidade}
              onChange={setField('especialidade')}
              options={especialidadeOptions}
              required
            />
            <Input
              label="CREA"
              value={form.crea}
              onChange={setField('crea')}
              placeholder="Ex.: TO-12345/D"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Estado (UF)"
              value={form.uf}
              onChange={setField('uf')}
              options={ufOptions}
            />
            <Select
              label="Município"
              value={form.municipio}
              onChange={setField('municipio')}
              options={municipioSelectOptions}
              disabled={!form.uf || loadingMunicipios}
            />
          </div>

          {!agronomoEditando && (
            <Input
              label="CPF (opcional)"
              value={form.cpf}
              onChange={(e) =>
                setForm((p) => ({ ...p, cpf: onlyDigits(e.target.value).slice(0, 11) }))
              }
              placeholder="00000000000"
              helperText="11 dígitos, sem pontos ou traço."
              maxLength={11}
            />
          )}
        </form>
      </Modal>

      {/* Modal: Confirmação */}
      {confirmacao && (
        <Modal
          isOpen={!!confirmacao}
          onClose={() => setConfirmacao(null)}
          title={labelConfirm[confirmacao.tipo].titulo}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmacao(null)} disabled={executandoAcao}>
                Cancelar
              </Button>
              <Button
                variant={labelConfirm[confirmacao.tipo].variante}
                loading={executandoAcao}
                onClick={() => void executarConfirmacao()}
              >
                {labelConfirm[confirmacao.tipo].btn}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            {labelConfirm[confirmacao.tipo].descricao}
          </p>
          <p className="mt-3 text-foreground font-medium">{confirmacao.agronomo.nome}</p>
          <p className="text-sm text-muted-foreground">{confirmacao.agronomo.email}</p>
        </Modal>
      )}
    </div>
  );
}
