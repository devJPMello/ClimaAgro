import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, BarChart3, CloudRain, Thermometer, Droplets, Wind, AlertTriangle } from 'lucide-react';
import Layout from './Layout';
import SimpleMap from './SimpleMap';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <Layout title="Dashboard">
      <div className="dashboard-content">
          {/* Top Metrics Cards */}
          <div className="metrics-grid">
            <div className="metric-card culture-card">
              <div className="metric-card-header">
                <div className="metric-icon culture-icon">
                  <Leaf size={24} />
                </div>
                <div className="metric-content">
                  <h3>Cultura em destaque</h3>
                  <p className="metric-value">Soja</p>
                  <span className="metric-subtitle">Safra 2024/25</span>
                </div>
              </div>
              <div className="metric-trend">
                <span className="trend-up">↗ +12%</span>
              </div>
            </div>

            <div className="metric-card productivity-card">
              <div className="metric-card-header">
                <div className="metric-icon productivity-icon">
                  <BarChart3 size={24} />
                </div>
                <div className="metric-content">
                  <h3>Produtividade média</h3>
                  <p className="metric-value">3,1 t/ha</p>
                  <span className="metric-subtitle">Última safra</span>
                </div>
              </div>
              <div className="metric-trend">
                <span className="trend-up">↗ +8%</span>
              </div>
            </div>

            <div className="metric-card precipitation-card">
              <div className="metric-card-header">
                <div className="metric-icon precipitation-icon">
                  <CloudRain size={24} />
                </div>
                <div className="metric-content">
                  <h3>Precipitação (30 dias)</h3>
                  <p className="metric-value">212 mm</p>
                  <span className="metric-subtitle">Acumulado</span>
                </div>
              </div>
              <div className="metric-trend">
                <span className="trend-neutral">→ 0%</span>
              </div>
            </div>

            <div className="metric-card alerts-card">
              <div className="metric-card-header">
                <div className="metric-icon alerts-icon">
                  <AlertTriangle size={24} />
                </div>
                <div className="metric-content">
                  <h3>Alertas ativos</h3>
                  <p className="metric-value">2</p>
                  <span className="metric-subtitle">Requer atenção</span>
                </div>
              </div>
              <div className="metric-trend">
                <span className="trend-neutral">→ 0</span>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="main-grid">
            {/* Map Section */}
            <div className="map-section">
              <h2>Mapa Resumido</h2>
              <div className="map-container">
                <SimpleMap height="100%" showControls={false} />
              </div>
              <button 
                className="view-map-button"
                onClick={() => handleNavigation('/map')}
              >
                Ver mapa completo
              </button>
            </div>

            {/* Weather Summary */}
            <div className="weather-summary">
              <h2>Resumo Climático da Região</h2>
              <div className="weather-cards">
                <div className="weather-card">
                  <div className="weather-icon">
                    <Thermometer size={28} />
                  </div>
                  <div className="weather-info">
                    <span className="weather-value">28°C</span>
                    <span className="weather-label">Temperatura</span>
                  </div>
                </div>

                <div className="weather-card">
                  <div className="weather-icon">
                    <Droplets size={28} />
                  </div>
                  <div className="weather-info">
                    <span className="weather-value">65%</span>
                    <span className="weather-label">Umidade</span>
                  </div>
                </div>

                <div className="weather-card">
                  <div className="weather-icon">
                    <CloudRain size={28} />
                  </div>
                  <div className="weather-info">
                    <span className="weather-value">15mm</span>
                    <span className="weather-label">Precipitação</span>
                  </div>
                </div>

                <div className="weather-card">
                  <div className="weather-icon">
                    <Wind size={28} />
                  </div>
                  <div className="weather-info">
                    <span className="weather-value">12 km/h</span>
                    <span className="weather-label">Vento</span>
                  </div>
                </div>
              </div>

              <div className="weather-condition">
                <p><strong>Condição:</strong> Parcialmente nublado</p>
              </div>
            </div>
          </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
