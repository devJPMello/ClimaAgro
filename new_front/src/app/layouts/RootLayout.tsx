import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import {
  Cloud,
  LayoutDashboard,
  MapPin,
  TrendingUp,
  LineChart,
  Bell,
  FileText,
  User,
  LogOut,
  Menu,
  X,
  Bot,
  Handshake,
  MessagesSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useUnreadAlerts } from '../../lib/hooks/useUnreadAlerts';

const navigationMain = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Mapa Climático', path: '/mapa-climatico', icon: MapPin },
  { name: 'Mapa de Produtividade', path: '/mapa-produtividade', icon: TrendingUp },
  { name: 'Séries Temporais', path: '/series-temporais', icon: LineChart },
  { name: 'Alertas', path: '/alertas', icon: Bell },
  { name: 'IAgro', path: '/iagro', icon: Bot },
  { name: 'Agrônomos Parceiros', path: '/parceiros', icon: Handshake },
  { name: 'Minhas conversas', path: '/minhas-conversas', icon: MessagesSquare },
  { name: 'Exportar Relatório', path: '/exportar', icon: FileText },
];

const perfilNavItem = { name: 'Perfil', path: '/perfil', icon: User };

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { count: alertCount, markAllSeen } = useUnreadAlerts();
  const toastShownRef = useRef(false);

  const navigation = useMemo(() => {
    return [...navigationMain, perfilNavItem];
  }, []);

  useEffect(() => {
    if (toastShownRef.current || alertCount === 0) return;
    toastShownRef.current = true;
    toast.warning(
      `${alertCount} alerta${alertCount > 1 ? 's' : ''} climático${alertCount > 1 ? 's' : ''} crítico${alertCount > 1 ? 's' : ''} na sua região`,
      {
        description: 'Veja os detalhes na página de Alertas.',
        duration: 8000,
        action: {
          label: 'Ver alertas',
          onClick: () => void navigate('/alertas'),
        },
      },
    );
  }, [alertCount, navigate]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userName = user?.fullName || user?.firstName || 'Usuário';
  const userEmail = user?.primaryEmailAddress?.emailAddress || 'sem-email@conta.com';

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await signOut({ redirectUrl: '/login' });
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 h-screen w-72 flex-shrink-0 bg-sidebar transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-3 text-sidebar-foreground">
              <div className="flex items-center justify-center w-10 h-10 bg-sidebar-primary rounded-lg">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
                  ClimaAgro
                </h1>
                <p className="text-xs text-sidebar-foreground/60">v2.1.0</p>
              </div>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isAlertas = item.path === '/alertas';

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    setSidebarOpen(false);
                    if (isAlertas) markAllSeen();
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <Icon className="w-5 h-5" />
                    {isAlertas && alertCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    )}
                  </div>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-sidebar-border p-4 relative">
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent/70 transition-colors"
            >
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={userName}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-sidebar-border"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-sidebar-primary-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-sidebar-foreground truncate leading-tight">{userName}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate leading-tight mt-1">{userEmail}</p>
              </div>
            </button>
            {userMenuOpen && (
              <div className="absolute left-4 right-4 bottom-full mb-2 bg-sidebar border border-sidebar-border rounded-lg p-2 shadow-xl z-20">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent rounded-lg transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 h-screen overflow-y-auto">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-30 p-2 text-foreground/60 hover:text-foreground bg-card border border-border rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page content */}
        <main className="px-4 pb-4 pt-16 lg:p-6 min-h-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
