import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Chrome, Facebook, Shield } from 'lucide-react';
import logoImage from '../assets/images/ClimaAgro.png';
import './Login.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle, loginWithFacebook } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Email ou senha incorretos');
      }
    } catch (err) {
      setError('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const success = await loginWithGoogle();
      if (success) {
        navigate('/dashboard');
      }
    } catch (err) {
      setError('Erro ao fazer login com Google');
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    try {
      const success = await loginWithFacebook();
      if (success) {
        navigate('/dashboard');
      }
    } catch (err) {
      setError('Erro ao fazer login com Facebook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-layout">
        {/* Seção da Logo */}
        <div className="logo-section">
          <div className="logo-container">
            <img 
              src={logoImage} 
              alt="ClimaAgro Logo" 
              className="logo-image"
            />
            <div className="logo-text">
              <p className="logo-subtitle">Soluções Inteligentes para Agricultura</p>
            </div>
          </div>
        </div>

        {/* Seção do Login */}
        <div className="login-section">
          <div className="login-card">
            <div className="login-header">
              <div className="login-title">
                <Shield className="title-icon" />
                <h2>Login</h2>
              </div>
              <p>Faça login para acessar o sistema</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="input-group">
                <div className="input-wrapper">
                  <Mail className="input-icon" />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <div className="divider">
              <span>ou continue com</span>
            </div>

            <div className="social-login">
              <button
                className="social-button google"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <Chrome size={20} />
                Entrar com Google
              </button>
              <button
                className="social-button facebook"
                onClick={handleFacebookLogin}
                disabled={loading}
              >
                <Facebook size={20} />
                Entrar com Facebook
              </button>
            </div>

            <div className="login-footer">
              <p>
                Não tem uma conta? <Link to="/register">Cadastre-se</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
