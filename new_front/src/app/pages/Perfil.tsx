import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { User, Mail, Moon, Phone, MapPin, Bell, FileText, Calendar, Sun, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useUser, useClerk } from '@clerk/clerk-react';
import { TO_CITY_VALUE_TO_NAME } from '../../lib/geo/tocantinsCities';
import { UF_NOME } from '../../lib/geo/brazilStatesMalha';
import { UF_IBGE_ID_BY_SIGLA } from '../../lib/geo/ufIbgeIds';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { getMyDualProfile, putMyDualProfile, deleteMyAccount } from '../../lib/api/dualProfileApi';
import { listReportExports } from '../../lib/api/reportExportsApi';
import { listClimateAlerts } from '../../lib/api/alertsApi';
import { useTheme } from '../contexts/ThemeContext';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { StatsListSkeleton } from '../components/ui/PageSkeletons';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { STORAGE_KEYS } from '../../lib/storage/storageKeys';
import { WhatsAppCard } from '../components/perfil/WhatsAppCard';

type StatItem = {
  label: string;
  valor: string;
  icon: typeof Calendar;
};

type ProfileStatsDto = {
  relatoriosExportados: number;
  alertasDisponiveis: number;
};

function formatDateTime(value: Date | number | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const timeZone = 'America/Sao_Paulo';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    const base = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(date);
    return base;
  }
}

function calcDaysSince(value: Date | number | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return String(Math.max(days, 0));
}

export function Perfil() {
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [editando, setEditando] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [ufSigla, setUfSigla] = useState('TO');
  const [municipioFavorito, setMunicipioFavorito] = useState('Palmas');
  const ufIbgeId = UF_IBGE_ID_BY_SIGLA[ufSigla] ?? '17';
  const { options: municipioOptions, loading: municipiosLoading, error: municipiosError } =
    useIbgeMunicipioSelectOptions(ufIbgeId);

  const ufOptions = useMemo(
    () =>
      Object.keys(UF_IBGE_ID_BY_SIGLA)
        .sort((a, b) => (UF_NOME[a] ?? a).localeCompare(UF_NOME[b] ?? b, 'pt-BR'))
        .map((sigla) => ({
          value: sigla,
          label: `${sigla} — ${UF_NOME[sigla] ?? sigla}`,
        })),
    []
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await getMyDualProfile(user.id);
        if (cancelled) return;
        if (p?.uf && UF_IBGE_ID_BY_SIGLA[p.uf]) {
          setUfSigla(p.uf);
        }
        if (p?.telefone) setTelefone(p.telefone);
        if (p?.notifAlertasCriticos !== undefined) setNotifAlertasCriticos(p.notifAlertasCriticos);
        if (p?.notifRelatorios !== undefined) setNotifRelatorios(p.notifRelatorios);
        if (p?.notifAtualizacoes !== undefined) setNotifAtualizacoes(p.notifAtualizacoes);
        if (p?.municipio) {
          setMunicipioFavorito(p.municipio);
        } else {
          try {
            const raw = window.localStorage.getItem(STORAGE_KEYS.PERFIL_MUNICIPIO_FAVORITO);
            if (raw != null) {
              const parsed = JSON.parse(raw) as string;
              if (typeof parsed === 'string' && parsed.trim()) {
                setMunicipioFavorito(parsed);
              }
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEYS.PERFIL_MUNICIPIO_FAVORITO);
          if (raw != null) {
            const parsed = JSON.parse(raw) as string;
            if (typeof parsed === 'string' && parsed.trim()) {
              setMunicipioFavorito(parsed);
            }
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!municipioOptions.length) return;
    const valid = new Set(municipioOptions.map((o) => o.value));
    if (valid.has(municipioFavorito)) return;
    const legacy = TO_CITY_VALUE_TO_NAME[municipioFavorito as keyof typeof TO_CITY_VALUE_TO_NAME];
    if (legacy && valid.has(legacy)) {
      setMunicipioFavorito(legacy);
      return;
    }
    const first = municipioOptions[0]?.value;
    if (first) setMunicipioFavorito(first);
  }, [municipioOptions, municipioFavorito]);

  const [notifAlertasCriticos, setNotifAlertasCriticos] = useState(true);
  const [notifRelatorios, setNotifRelatorios] = useState(true);
  const [notifAtualizacoes, setNotifAtualizacoes] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNome(user.fullName || user.firstName || '');
    setEmail(user.primaryEmailAddress?.emailAddress || '');
    setTelefone(user.primaryPhoneNumber?.phoneNumber || '');
  }, [user]);

  const {
    status: statsStatus,
    data: statsData,
    error: statsError,
    reload: reloadStats,
  } = useAsyncResource<ProfileStatsDto>(async () => {
    const [exportsPayload, alertsPayload] = await Promise.all([listReportExports(), listClimateAlerts()]);
    return {
      relatoriosExportados: exportsPayload.items.length,
      alertasDisponiveis: alertsPayload.items.length,
    };
  }, []);

  const handleSalvar = async () => {
    if (!user?.id) {
      toast.error('Sessão inválida. Faça login novamente.');
      return;
    }
    toast.info('Nome e email vêm da conta Clerk; localização é salva no ClimaAgro.');
    try {
      await putMyDualProfile(user.id, {
        uf: ufSigla,
        municipio: municipioFavorito,
        telefone: telefone.trim() || null,
        nome: user.fullName || user.firstName || nome || 'Produtor',
        email: user.primaryEmailAddress?.emailAddress || email || 'sem-email@climaagro.local',
      });
      toast.success('Perfil atualizado com sucesso!');
      setEditando(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar.';
      toast.error(msg);
    }
  };

  const handleNotifChange = async (
    field: 'notifAlertasCriticos' | 'notifRelatorios' | 'notifAtualizacoes',
    value: boolean,
  ) => {
    if (!user?.id) return;
    if (field === 'notifAlertasCriticos') setNotifAlertasCriticos(value);
    if (field === 'notifRelatorios') setNotifRelatorios(value);
    if (field === 'notifAtualizacoes') setNotifAtualizacoes(value);
    try {
      await putMyDualProfile(user.id, { [field]: value });
    } catch {
      if (field === 'notifAlertasCriticos') setNotifAlertasCriticos(!value);
      if (field === 'notifRelatorios') setNotifRelatorios(!value);
      if (field === 'notifAtualizacoes') setNotifAtualizacoes(!value);
      toast.error('Não foi possível salvar a preferência.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) return;
    setDeleting(true);
    try {
      await deleteMyAccount(user.id);
      toast.success('Conta excluída. Seus dados foram removidos conforme a LGPD.');
      await signOut();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível excluir a conta.';
      toast.error(msg);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const estatisticas: StatItem[] = [
    { label: 'Último acesso', valor: formatDateTime(user?.lastSignInAt || user?.updatedAt), icon: Calendar },
    {
      label: 'Relatórios exportados',
      valor: statsData != null ? String(statsData.relatoriosExportados) : '—',
      icon: FileText,
    },
    {
      label: 'Alertas disponíveis (7d)',
      valor: statsData != null ? String(statsData.alertasDisponiveis) : '—',
      icon: Bell,
    },
    { label: 'Dias de conta', valor: calcDaysSince(user?.createdAt), icon: User },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Perfil
        </h1>
        <p className="text-muted-foreground">
          Gerencie suas informações pessoais e preferências
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informações Pessoais */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Informações Pessoais</CardTitle>
                  <CardDescription>Seus dados cadastrais</CardDescription>
                </div>
                {!editando && (
                  <Button variant="secondary" onClick={() => setEditando(true)}>
                    Editar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="flex items-center gap-4 mb-6">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={nome || 'Usuário'}
                    className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-10 h-10 text-primary-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg leading-snug">{nome}</h3>
                  <p className="text-sm text-muted-foreground truncate" title={email}>{email}</p>
                </div>
              </div>

              <div className="relative">
                <User className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Input
                  label="Nome Completo"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="pl-11"
                  disabled
                  helperText="Gerenciado pela conta Clerk"
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11"
                  disabled
                  helperText="Gerenciado pela conta Clerk"
                />
              </div>

              <div className="relative">
                <Phone className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Input
                  label="Telefone"
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="pl-11"
                  disabled={!editando}
                />
              </div>

              <div className="relative space-y-1">
                <MapPin className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Select
                  label="UF (estado)"
                  value={ufSigla}
                  onChange={(e) => setUfSigla(e.target.value)}
                  options={ufOptions}
                  className="pl-11"
                  disabled={!editando}
                />
                <p className="text-xs text-muted-foreground pl-1">
                  Usado em dados regionais, alertas e no IAgro (gravado no servidor).
                </p>
              </div>

              <div className="relative space-y-1">
                <MapPin className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Select
                  label="Município"
                  value={municipioFavorito}
                  onChange={(e) => setMunicipioFavorito(e.target.value)}
                  options={municipioOptions}
                  className="pl-11"
                  disabled={!editando || municipiosLoading}
                  error={municipiosError ?? undefined}
                />
                <p className="text-xs text-muted-foreground pl-1">
                  Nome oficial IBGE, alinhado aos mapas e séries do app.
                </p>
              </div>

              {editando && (
                <>
                  <div className="flex items-center justify-between gap-3 pt-4">
                    <div className="flex gap-3">
                      <Button variant="primary" onClick={handleSalvar}>
                        Salvar Alterações
                      </Button>
                      <Button variant="ghost" onClick={() => setEditando(false)}>
                        Cancelar
                      </Button>
                    </div>
                    <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                      Excluir Conta
                    </Button>
                  </div>

                  <Modal
                    isOpen={confirmDelete}
                    onClose={() => !deleting && setConfirmDelete(false)}
                    title="Excluir Conta"
                    size="md"
                    footer={
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void handleDeleteAccount()}
                          loading={deleting}
                          disabled={deleting}
                        >
                          Confirmar exclusão
                        </Button>
                      </>
                    }
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 mx-auto">
                        <AlertTriangle className="w-7 h-7 text-destructive" />
                      </div>
                      <p className="text-center text-sm font-medium text-foreground">
                        Tem certeza que deseja excluir sua conta?
                      </p>
                      <p className="text-sm text-muted-foreground text-center">
                        Esta ação é <strong>irreversível</strong>. Os seguintes dados serão
                        removidos permanentemente:
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1.5 pl-4 list-disc">
                        <li>Perfil e informações pessoais</li>
                        <li>Histórico de conversas com o IAgro</li>
                      </ul>
                      <p className="text-xs text-muted-foreground text-center border-t border-border pt-3">
                        Conforme o art. 18, VI da LGPD — direito ao esquecimento.
                        Você será desconectado automaticamente.
                      </p>
                    </div>
                  </Modal>
                </>
              )}
            </CardBody>
          </Card>

        </div>

        {/* Estatísticas */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estatísticas Pessoais</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <AsyncStateView
                status={statsStatus}
                data={statsData}
                error={statsError}
                onRetry={reloadStats}
                loading={<StatsListSkeleton />}
                isEmpty={() => false}
                empty={
                  <EmptyState
                    icon={Calendar}
                    title="Sem estatísticas disponíveis"
                    description="Ainda não há dados suficientes para exibir estatísticas pessoais."
                  />
                }
              >
                {() => (
                  <>
                    {estatisticas.map((stat, index) => {
                      const Icon = stat.icon;
                      return (
                        <div key={index} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                            <p className="text-base">{stat.valor}</p>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </AsyncStateView>
            </CardBody>
          </Card>

          {/* Aparência */}
          <Card>
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {([
                { key: 'light', label: 'Claro', Icon: Sun },
                { key: 'dark', label: 'Escuro', Icon: Moon },
              ] as const).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setTheme(key); toast.success(`Tema ${label} ativado`); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 text-left ${
                    theme === key
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-accent/50 text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1">{label}</span>
                  {theme === key && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Ativo</span>
                  )}
                </button>
              ))}
            </CardBody>
          </Card>

          {user?.id ? <WhatsAppCard clerkUserId={user.id} /> : null}

          {/* Preferências de Notificação */}
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>Escolha quais avisos deseja receber na plataforma</CardDescription>
            </CardHeader>
            <CardBody className="space-y-5">
              <Checkbox
                label={
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Alertas climáticos críticos por WhatsApp</span>
                    <span className="text-xs text-muted-foreground">Avisos oficiais de severidade alta no seu estado, enviados ao WhatsApp confirmado acima</span>
                  </span>
                }
                checked={notifAlertasCriticos}
                onChange={(e) => void handleNotifChange('notifAlertasCriticos', e.target.checked)}
              />
              <Checkbox
                label={
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Relatórios disponíveis</span>
                    <span className="text-xs text-muted-foreground">Aviso quando um relatório climático estiver pronto para download</span>
                  </span>
                }
                checked={notifRelatorios}
                onChange={(e) => void handleNotifChange('notifRelatorios', e.target.checked)}
              />
              <Checkbox
                label={
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Novidades da plataforma</span>
                    <span className="text-xs text-muted-foreground">Novas funcionalidades, melhorias e comunicados do ClimaAgro</span>
                  </span>
                }
                checked={notifAtualizacoes}
                onChange={(e) => void handleNotifChange('notifAtualizacoes', e.target.checked)}
              />
            </CardBody>
          </Card>

        </div>
      </div>
    </div>
  );
}
