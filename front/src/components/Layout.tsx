import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Map, AlertTriangle, Download, User, Home, Layers, TrendingUp, Settings, LogOut, ChevronDown } from 'lucide-react';
import arrowLeft from '../assets/images/arrow-left.svg';
import arrowRight from '../assets/images/arrow-right.svg';
import logo from '../assets/images/ClimaAgro.png';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    navigate('/profile');
    setSidebarCollapsed(true);
  };

  const handleSettingsClick = () => {
    navigate('/edit-profile');
    setSidebarCollapsed(true);
  };

  const sidebarItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Map, label: 'Mapa Interativo', path: '/map' },
    { icon: Layers, label: 'Mapa de Produtividade', path: '/productivity-map' },
    { icon: TrendingUp, label: 'Séries Temporais', path: '/time-series' },
    { icon: AlertTriangle, label: 'Alertas Climáticos', path: '/alerts' },
    { icon: Download, label: 'Exportar Relatório', path: '/export' }
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setSidebarCollapsed(true); // Fechar sidebar ao navegar
  };

  // Controlar sidebar baseado na rota
  useEffect(() => {
    // Manter sidebar aberta em todas as páginas principais
    const mainPages = ['/dashboard', '/map', '/productivity-map', '/time-series', '/alerts', '/export'];
    if (mainPages.includes(location.pathname)) {
      setSidebarCollapsed(false);
    } else {
      setSidebarCollapsed(true);
    }
  }, [location.pathname]);

  // Fechar menu do usuário quando sidebar colapsar
  useEffect(() => {
    if (sidebarCollapsed) {
      setUserMenuOpen(false);
    }
  }, [sidebarCollapsed]);

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <img 
            src={logo} 
            alt="ClimaAgro" 
            className={`sidebar-logo ${sidebarCollapsed ? 'collapsed' : ''}`}
          />
        </div>
        
        <nav className="sidebar-nav">
          {/* Toggle Button Above Dashboard */}
          <div className="toggle-container">
            <button 
              className="sidebar-toggle-small"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Abrir sidebar' : 'Fechar sidebar'}
            >
              {sidebarCollapsed ? (
                <img src={arrowRight} alt="Abrir sidebar" width="16" height="16" />
              ) : (
                <img src={arrowLeft} alt="Fechar sidebar" width="16" height="16" />
              )}
            </button>
          </div>

          {/* Dashboard Item */}
          <button
            className={`sidebar-item ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => handleNavigation('/dashboard')}
            title={sidebarCollapsed ? 'Dashboard' : ''}
          >
            <Home size={20} />
            <span className={sidebarCollapsed ? 'hidden' : ''}>Dashboard</span>
          </button>

          {sidebarItems.slice(1).map((item, index) => (
            <button
              key={index + 1}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => handleNavigation(item.path)}
              title={sidebarCollapsed ? item.label : ''}
            >
              <item.icon size={20} />
              <span className={sidebarCollapsed ? 'hidden' : ''}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <button 
              className="user-profile-button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title={sidebarCollapsed ? 'Perfil do usuário' : ''}
            >
              <div className="user-avatar">
                <User size={20} />
              </div>
              {!sidebarCollapsed && (
                <div className="user-info">
                  <div className="user-name">{user?.name || 'Usuário'}</div>
                  <div className="user-email">{user?.email || 'usuario@exemplo.com'}</div>
                </div>
              )}
              {!sidebarCollapsed && <ChevronDown size={16} className={`chevron ${userMenuOpen ? 'open' : ''}`} />}
            </button>
            
            {userMenuOpen && !sidebarCollapsed && (
              <div className="user-menu">
                <button className="user-menu-item" onClick={handleProfileClick}>
                  <User size={16} />
                  <span>Meu Perfil</span>
                </button>
                <button className="user-menu-item" onClick={handleSettingsClick}>
                  <Settings size={16} />
                  <span>Configurações</span>
                </button>
                <div className="user-menu-divider"></div>
                <button className="user-menu-item logout" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Home Button - Only show on non-dashboard pages */}
      {location.pathname !== '/dashboard' && (
        <button 
          className="home-button"
          onClick={() => {
            navigate('/dashboard');
            setSidebarCollapsed(false);
          }}
          title="Voltar ao início"
        >
          <Home size={24} />
        </button>
      )}

      {/* Main Content */}
      <div className="main-content">
        {/* Content */}
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
