import React, { useState } from 'react';
import { AlertTriangle, Search, Filter, Thermometer, Droplets, Wind, CloudRain } from 'lucide-react';
import Layout from './Layout';
import './WeatherAlerts.css';

interface WeatherAlert {
  id: string;
  type: 'temperature' | 'precipitation' | 'wind' | 'storm';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  temperature?: number;
  precipitation?: number;
  windSpeed?: number;
}

const WeatherAlerts: React.FC = () => {
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const mockAlerts: WeatherAlert[] = [
    {
      id: '1',
      type: 'temperature',
      severity: 'high',
      title: 'Alerta de Temperatura Elevada',
      description: 'Temperaturas acima de 35°C são esperadas para os próximos 3 dias. Recomenda-se evitar atividades ao ar livre nos horários mais quentes.',
      location: 'Palmas - TO',
      date: '20/07/2025',
      time: '14:30',
      temperature: 38
    },
    {
      id: '2',
      type: 'precipitation',
      severity: 'critical',
      title: 'Alerta de Chuva Intensa',
      description: 'Precipitação intensa com acumulado de mais de 50mm em 24h. Risco de alagamentos e enchentes em áreas baixas.',
      location: 'Gurupi - TO',
      date: '19/07/2025',
      time: '18:45',
      precipitation: 65
    },
    {
      id: '3',
      type: 'wind',
      severity: 'medium',
      title: 'Alerta de Ventos Fortes',
      description: 'Ventos com velocidade de até 60 km/h são esperados. Cuidado com objetos soltos e galhos de árvores.',
      location: 'Araguaína - TO',
      date: '18/07/2025',
      time: '09:15',
      windSpeed: 58
    },
    {
      id: '4',
      type: 'storm',
      severity: 'critical',
      title: 'Alerta de Tempestade',
      description: 'Formação de tempestade com raios, granizo e ventos fortes. Evite áreas abertas e procure abrigo.',
      location: 'Porto Nacional - TO',
      date: '17/07/2025',
      time: '16:20',
      windSpeed: 75
    },
    {
      id: '5',
      type: 'temperature',
      severity: 'low',
      title: 'Aviso de Temperatura Baixa',
      description: 'Temperaturas podem chegar a 15°C durante a madrugada. Cuidado com plantas sensíveis ao frio.',
      location: 'Colinas - TO',
      date: '16/07/2025',
      time: '22:10',
      temperature: 16
    }
  ];

  const regions = [
    { value: 'all', label: 'Todas as regiões' },
    { value: 'palmas', label: 'Palmas - TO' },
    { value: 'gurupi', label: 'Gurupi - TO' },
    { value: 'araguaina', label: 'Araguaína - TO' },
    { value: 'porto-nacional', label: 'Porto Nacional - TO' },
    { value: 'colinas', label: 'Colinas - TO' }
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return '#38a169';
      case 'medium': return '#d69e2e';
      case 'high': return '#dd6b20';
      case 'critical': return '#e53e3e';
      default: return '#718096';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'low': return 'Baixo';
      case 'medium': return 'Médio';
      case 'high': return 'Alto';
      case 'critical': return 'Crítico';
      default: return 'Desconhecido';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'temperature': return <Thermometer size={20} />;
      case 'precipitation': return <Droplets size={20} />;
      case 'wind': return <Wind size={20} />;
      case 'storm': return <CloudRain size={20} />;
      default: return <AlertTriangle size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'temperature': return 'Temperatura';
      case 'precipitation': return 'Precipitação';
      case 'wind': return 'Vento';
      case 'storm': return 'Tempestade';
      default: return 'Outro';
    }
  };

  const filteredAlerts = mockAlerts.filter(alert => {
    const matchesRegion = selectedRegion === 'all' || 
      alert.location.toLowerCase().includes(selectedRegion.toLowerCase());
    const matchesSearch = alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.location.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRegion && matchesSearch;
  });

  return (
    <Layout title="Alertas Climáticos">
      <div className="weather-alerts-container">

      {/* Search Only */}
      <div className="filters-section">
        <div className="search-container">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar alertas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Alerts List */}
      <div className="alerts-content">
        <div className="alerts-summary">
          <h2>Alertas Ativos ({filteredAlerts.length})</h2>
          <p>Última atualização: {new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div className="alerts-grid">
          {filteredAlerts.length === 0 ? (
            <div className="no-alerts">
              <AlertTriangle size={48} />
              <h3>Nenhum alerta encontrado</h3>
              <p>Tente ajustar os filtros de busca</p>
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <div key={alert.id} className="alert-card">
                <div className="alert-header">
                  <div className="alert-type">
                    {getTypeIcon(alert.type)}
                    <span>{getTypeLabel(alert.type)}</span>
                  </div>
                  <div 
                    className="alert-severity"
                    style={{ backgroundColor: getSeverityColor(alert.severity) }}
                  >
                    {getSeverityLabel(alert.severity)}
                  </div>
                </div>

                <div className="alert-content">
                  <h3 className="alert-title">{alert.title}</h3>
                  <p className="alert-description">{alert.description}</p>
                  
                  <div className="alert-details">
                    <div className="alert-location">
                      <strong>Local:</strong> {alert.location}
                    </div>
                    <div className="alert-datetime">
                      <strong>Data:</strong> {alert.date} às {alert.time}
                    </div>
                  </div>

                  {alert.temperature && (
                    <div className="alert-metric">
                      <Thermometer size={16} />
                      <span>Temperatura: {alert.temperature}°C</span>
                    </div>
                  )}

                  {alert.precipitation && (
                    <div className="alert-metric">
                      <Droplets size={16} />
                      <span>Precipitação: {alert.precipitation}mm</span>
                    </div>
                  )}

                  {alert.windSpeed && (
                    <div className="alert-metric">
                      <Wind size={16} />
                      <span>Vento: {alert.windSpeed} km/h</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </Layout>
  );
};

export default WeatherAlerts;
