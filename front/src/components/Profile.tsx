import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, BarChart3, MapPin, Clock, Download, Phone, Edit3 } from 'lucide-react';
import Layout from './Layout';
import './Profile.css';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const exportedReports = [
    { date: '20/07/2025', title: 'Relatório de produtividade para Palmas' },
    { date: '18/07/2025', title: 'Relatório de clima para Gurupi' },
    { date: '15/07/2025', title: 'Relatório de alertas climáticos para Araguaína' }
  ];

  const mostConsultedMunicipalities = [
    'Palmas',
    'Gurupi',
    'Araguaína'
  ];

  const lastAccesses = [
    '20/07/2025 às 14:22',
    '19/07/2025 às 18:55',
    '17/07/2025 às 10:12'
  ];

  const handleExportData = () => {
    // Simular exportação de dados
    alert('Solicitação de exportação de dados enviada! Você receberá um e-mail com o link para download.');
  };

  return (
    <Layout title="Meu Perfil">
      <div className="profile-container">

      <div className="profile-content">
        <div className="profile-main">
          {/* Profile Header */}
          <div className="profile-header-section">
            <div className="profile-avatar">
              <div className="avatar-circle">
                <User size={32} />
              </div>
            </div>
            <div className="profile-info">
              <h2>{user?.name}</h2>
              <p className="profile-email">{user?.email}</p>
              <p className="profile-phone">
                <Phone size={16} />
                {user?.phone || 'Telefone não informado'}
              </p>
              <p className="profile-course">Curso: Engenharia de Software</p>
            </div>
          </div>

          {/* Profile Details */}
          <div className="profile-details">
            <div className="detail-row">
              <span className="detail-label">Telefone</span>
              <span className="detail-value">{user?.phone || 'Não informado'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Município Favorito</span>
              <span className="detail-value">{user?.favoriteMunicipality || 'Não definido'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Último Acesso</span>
              <span className="detail-value">{user?.lastAccess || 'N/A'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Data de Cadastro</span>
              <span className="detail-value">{user?.registrationDate || 'N/A'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Número de Relatórios Exportados</span>
              <span className="detail-value">{user?.exportedReports || 0}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Preferência de Notificação</span>
              <span className="detail-value">{user?.notificationPreference || 'Receber alertas por e-mail'}</span>
            </div>
          </div>

          {/* Edit Profile Button */}
          <div className="profile-actions">
            <button 
              className="edit-profile-button"
              onClick={() => navigate('/edit-profile')}
            >
              <Edit3 size={20} />
              Editar Perfil
            </button>
          </div>

        </div>

        {/* Sidebar */}
        <div className="profile-sidebar">
          {/* Exported Reports History */}
          <div className="sidebar-card">
            <div className="card-header">
              <BarChart3 size={20} />
              <h3>Histórico de Relatórios Exportados</h3>
            </div>
            <div className="card-content">
              <ul className="report-list">
                {exportedReports.map((report, index) => (
                  <li key={index} className="report-item">
                    <Clock size={16} />
                    <div className="report-info">
                      <span className="report-date">{report.date}</span>
                      <span className="report-title">{report.title}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Most Consulted Municipalities */}
          <div className="sidebar-card">
            <div className="card-header">
              <MapPin size={20} />
              <h3>Municípios Mais Consultados</h3>
            </div>
            <div className="card-content">
              <ul className="municipality-list">
                {mostConsultedMunicipalities.map((municipality, index) => (
                  <li key={index} className="municipality-item">
                    <MapPin size={16} />
                    <span>{municipality}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Last System Accesses */}
          <div className="sidebar-card">
            <div className="card-header">
              <Clock size={20} />
              <h3>Últimos Acessos ao Sistema</h3>
            </div>
            <div className="card-content">
              <ul className="access-list">
                {lastAccesses.map((access, index) => (
                  <li key={index} className="access-item">
                    <Clock size={16} />
                    <span>{access}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Data Export Button */}
          <button className="data-export-button" onClick={handleExportData}>
            <Download size={20} />
            Solicitar meus dados completos (formato CSV)
          </button>
        </div>
      </div>
      </div>
    </Layout>
  );
};

export default Profile;
