import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, MapPin, Bell, Save, X, Phone } from 'lucide-react';
import Layout from './Layout';
import './EditProfile.css';

const EditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    favoriteMunicipality: user?.favoriteMunicipality || '',
    notificationPreference: user?.notificationPreference || 'Receber alertas por e-mail'
  });

  const municipalities = [
    'Palmas - TO',
    'Gurupi - TO',
    'Araguaína - TO',
    'Porto Nacional - TO',
    'Colinas - TO',
    'Paraíso do Tocantins - TO',
    'Tocantinópolis - TO',
    'Miracema do Tocantins - TO'
  ];

  const notificationOptions = [
    'Receber alertas por e-mail',
    'Receber alertas por WhatsApp',
    'Receber alertas por SMS',
    'Não receber notificações'
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    
    try {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      updateUser(formData);
      navigate('/profile');
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      alert('Erro ao salvar perfil. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/profile');
  };

  return (
    <Layout title="Editar Perfil">
      <div className="edit-profile-container">
        {/* Header Actions */}
        <div className="edit-header-actions">
          <button 
            className="cancel-button"
            onClick={handleCancel}
            disabled={isLoading}
          >
            <X size={20} />
            Cancelar
          </button>
          <button 
            className="save-button"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save size={20} />
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

      <div className="edit-content">
        <div className="edit-form">
          {/* Profile Picture Section */}
          <div className="form-section">
            <h2>Foto do Perfil</h2>
            <div className="profile-picture-section">
              <div className="current-avatar">
                <div className="avatar-circle">
                  <User size={32} />
                </div>
              </div>
              <div className="avatar-actions">
                <button className="change-photo-button">
                  Alterar Foto
                </button>
                <button className="remove-photo-button">
                  Remover
                </button>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="form-section">
            <h2>Informações Pessoais</h2>
            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="name">
                  <User size={16} />
                  Nome Completo
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="form-input"
                />
              </div>

              <div className="input-group">
                <label htmlFor="email">
                  <Mail size={16} />
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Digite seu e-mail"
                  className="form-input"
                />
              </div>

              <div className="input-group">
                <label htmlFor="phone">
                  <Phone size={16} />
                  Telefone
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(63) 99999-9999"
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="form-section">
            <h2>Preferências</h2>
            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="favoriteMunicipality">
                  <MapPin size={16} />
                  Município Favorito
                </label>
                <select
                  id="favoriteMunicipality"
                  value={formData.favoriteMunicipality}
                  onChange={(e) => handleInputChange('favoriteMunicipality', e.target.value)}
                  className="form-select"
                >
                  <option value="">Selecione um município</option>
                  {municipalities.map((municipality, index) => (
                    <option key={index} value={municipality}>
                      {municipality}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="notificationPreference">
                  <Bell size={16} />
                  Preferência de Notificação
                </label>
                <select
                  id="notificationPreference"
                  value={formData.notificationPreference}
                  onChange={(e) => handleInputChange('notificationPreference', e.target.value)}
                  className="form-select"
                >
                  {notificationOptions.map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="form-section">
            <h2>Segurança</h2>
            <div className="security-actions">
              <button className="change-password-button">
                Alterar Senha
              </button>
              <button className="two-factor-button">
                Configurar Autenticação de Dois Fatores
              </button>
            </div>
          </div>

          {/* Account Actions */}
          <div className="form-section">
            <h2>Ações da Conta</h2>
            <div className="account-actions">
              <button className="export-data-button">
                Exportar Meus Dados
              </button>
              <button className="delete-account-button">
                Excluir Conta
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="profile-preview">
          <h2>Pré-visualização</h2>
          <div className="preview-card">
            <div className="preview-avatar">
              <div className="avatar-circle">
                <User size={24} />
              </div>
            </div>
            <div className="preview-info">
              <h3>{formData.name || 'Nome não informado'}</h3>
              <p>{formData.email || 'E-mail não informado'}</p>
              <p>
                <Phone size={14} />
                {formData.phone || 'Telefone não informado'}
              </p>
              <p>Curso: Engenharia de Software</p>
            </div>
          </div>
          
          <div className="preview-details">
            <div className="preview-detail">
              <strong>Município Favorito:</strong>
              <span>{formData.favoriteMunicipality || 'Não definido'}</span>
            </div>
            <div className="preview-detail">
              <strong>Notificações:</strong>
              <span>{formData.notificationPreference}</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
};

export default EditProfile;
