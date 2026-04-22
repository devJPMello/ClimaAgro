import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { User, Mail, Phone, MapPin, Bell, FileText, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { TO_CITY_VALUE_TO_NAME } from '../../lib/geo/tocantinsCities';
import { useIbgeMunicipioSelectOptions } from '../../lib/hooks/useIbgeMunicipioSelectOptions';
import { listReportExports } from '../../lib/api/reportExportsApi';
import { listClimateAlerts } from '../../lib/api/alertsApi';
import { usePersistedState } from '../../lib/hooks/usePersistedState';
import { useAsyncResource } from '../../lib/hooks/useAsyncResource';
import { AsyncStateView } from '../components/ui/AsyncStateView';
import { EmptyState } from '../components/ui/EmptyState';

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
  const { user } = useUser();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [municipioFavorito, setMunicipioFavorito] = usePersistedState('climaagro.pref.perfil.municipioFavorito', 'Palmas');
  const { options: municipioOptions, loading: municipiosLoading, error: municipiosError } = useIbgeMunicipioSelectOptions();

  useEffect(() => {
    if (!municipioOptions.length) return;
    const valid = new Set(municipioOptions.map((o) => o.value));
    if (valid.has(municipioFavorito)) return;
    const legacy = TO_CITY_VALUE_TO_NAME[municipioFavorito as keyof typeof TO_CITY_VALUE_TO_NAME];
    if (legacy && valid.has(legacy)) {
      setMunicipioFavorito(legacy);
      return;
    }
    if (valid.has('Palmas')) setMunicipioFavorito('Palmas');
  }, [municipioOptions, municipioFavorito, setMunicipioFavorito]);

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

  const handleSalvar = () => {
    toast.info('Nome e email são gerenciados pela conta Clerk.');
    toast.success('Perfil atualizado com sucesso!');
    setEditando(false);
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
                    className="w-20 h-20 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-10 h-10 text-primary-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg">{nome}</h3>
                  <p className="text-sm text-muted-foreground">{email}</p>
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

              <div className="relative">
                <MapPin className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
                <Select
                  label="Município Favorito"
                  value={municipioFavorito}
                  onChange={(e) => setMunicipioFavorito(e.target.value)}
                  options={municipioOptions}
                  className="pl-11"
                  disabled={!editando || municipiosLoading}
                  error={municipiosError ?? undefined}
                />
              </div>

              {editando && (
                <div className="flex gap-3 pt-4">
                  <Button variant="primary" onClick={handleSalvar}>
                    Salvar Alterações
                  </Button>
                  <Button variant="ghost" onClick={() => setEditando(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Preferências de Notificação */}
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>Escolha como deseja receber notificações</CardDescription>
            </CardHeader>
            <CardBody className="space-y-4">
              <Checkbox
                label="Alertas climáticos críticos"
                checked={notifAlertasCriticos}
                onChange={(e) => setNotifAlertasCriticos(e.target.checked)}
              />
              <Checkbox
                label="Relatórios prontos para download"
                checked={notifRelatorios}
                onChange={(e) => setNotifRelatorios(e.target.checked)}
              />
              <Checkbox
                label="Atualizações do sistema e novidades"
                checked={notifAtualizacoes}
                onChange={(e) => setNotifAtualizacoes(e.target.checked)}
              />
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

          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button variant="secondary" className="w-full">
                Alterar Senha
              </Button>
              <Button variant="ghost" className="w-full">
                Configurar 2FA
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conta</CardTitle>
            </CardHeader>
            <CardBody>
              <Button variant="danger" className="w-full">
                Excluir Conta
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Esta ação é irreversível e todos os seus dados serão removidos.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
