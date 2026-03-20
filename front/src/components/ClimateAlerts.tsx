import React, { useState, useEffect } from 'react';
import { AlertTriangle, Thermometer, CloudRain, Droplets, Wind, Sun, Eye, EyeOff, Filter, Download } from 'lucide-react';
import Layout from './Layout';
import './ClimateAlerts.css';

interface ClimateAlert {
  id: string;
  type: 'high_temperature' | 'low_temperature' | 'heavy_rain' | 'water_stress' | 'low_humidity' | 'high_wind' | 'drought' | 'flood';
  severity: 'info' | 'warning' | 'danger' | 'critical';
  message: string;
  date: string;
  value: number;
  threshold: number;
  location: {
    name: string;
    state: string;
    region: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  description?: string;
  recommendations?: string[];
  affectedArea?: number; // em hectares
  estimatedLoss?: number; // em toneladas ou valor monetário
}

interface ClimateAlertsProps {
  alerts: ClimateAlert[];
  onAlertClick?: (alert: ClimateAlert) => void;
  showFilters?: boolean;
  showMap?: boolean;
}

const ClimateAlerts: React.FC<ClimateAlertsProps> = ({
  alerts,
  onAlertClick,
  showFilters = true,
  showMap = false
}) => {
  // Dados mock para demonstração
  const mockAlerts: ClimateAlert[] = [
    {
      id: '1',
      type: 'high_temperature',
      severity: 'warning',
      message: 'Temperatura elevada detectada na região',
      date: '2024-01-15T10:30:00Z',
      value: 38.5,
      threshold: 35.0,
      location: {
        name: 'Fazenda São João',
        state: 'Mato Grosso',
        region: 'Centro-Oeste'
      },
      coordinates: {
        lat: -15.7801,
        lng: -56.0889
      },
      description: 'Temperatura acima do normal para o período, podendo afetar o desenvolvimento das culturas.',
      recommendations: [
        'Aumentar irrigação nas áreas críticas',
        'Monitorar umidade do solo',
        'Considerar sombreamento temporário'
      ],
      affectedArea: 150,
      estimatedLoss: 25
    },
    {
      id: '2',
      type: 'drought',
      severity: 'danger',
      message: 'Período de seca prolongado',
      date: '2024-01-14T08:15:00Z',
      value: 15,
      threshold: 20,
      location: {
        name: 'Fazenda Verde Vale',
        state: 'Goiás',
        region: 'Centro-Oeste'
      },
      coordinates: {
        lat: -16.6869,
        lng: -49.2648
      },
      description: 'Precipitação abaixo da média histórica por mais de 20 dias consecutivos.',
      recommendations: [
        'Implementar sistema de irrigação de emergência',
        'Reduzir densidade de plantio',
        'Aplicar cobertura morta para conservar umidade'
      ],
      affectedArea: 300,
      estimatedLoss: 45
    },
    {
      id: '3',
      type: 'heavy_rain',
      severity: 'info',
      message: 'Chuva intensa prevista',
      date: '2024-01-13T14:20:00Z',
      value: 85,
      threshold: 50,
      location: {
        name: 'Fazenda Primavera',
        state: 'Paraná',
        region: 'Sul'
      },
      coordinates: {
        lat: -24.7953,
        lng: -53.7640
      },
      description: 'Previsão de chuva intensa nos próximos 3 dias.',
      recommendations: [
        'Drenar áreas alagadas',
        'Proteger equipamentos',
        'Monitorar erosão do solo'
      ],
      affectedArea: 200,
      estimatedLoss: 10
    },
    {
      id: '4',
      type: 'low_humidity',
      severity: 'warning',
      message: 'Umidade relativa baixa',
      date: '2024-01-12T11:45:00Z',
      value: 25,
      threshold: 40,
      location: {
        name: 'Fazenda Horizonte',
        state: 'Bahia',
        region: 'Nordeste'
      },
      coordinates: {
        lat: -12.5797,
        lng: -41.7007
      },
      description: 'Umidade relativa do ar abaixo de 30% por vários dias consecutivos.',
      recommendations: [
        'Aumentar frequência de irrigação',
        'Usar nebulização nas estufas',
        'Monitorar estresse hídrico das plantas'
      ],
      affectedArea: 100,
      estimatedLoss: 15
    }
  ];

  // Usar dados mock se alerts estiver vazio
  const alertsData = alerts.length > 0 ? alerts : mockAlerts;
  const [filteredAlerts, setFilteredAlerts] = useState<ClimateAlert[]>(alertsData);
  const [filters, setFilters] = useState({
    severity: 'all',
    type: 'all',
    region: 'all',
    state: 'all',
    dateRange: '7' // últimos 7 dias
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    applyFilters();
  }, [alertsData, appliedFilters, sortBy, sortOrder]);

  const applyFilters = () => {
    let filtered = [...alertsData];

    // Filtrar por severidade
    if (appliedFilters.severity !== 'all') {
      filtered = filtered.filter(alert => alert.severity === appliedFilters.severity);
    }

    // Filtrar por tipo
    if (appliedFilters.type !== 'all') {
      filtered = filtered.filter(alert => alert.type === appliedFilters.type);
    }

    // Filtrar por região
    if (appliedFilters.region !== 'all') {
      filtered = filtered.filter(alert => alert.location.region === appliedFilters.region);
    }

    // Filtrar por estado
    if (appliedFilters.state !== 'all') {
      filtered = filtered.filter(alert => alert.location.state === appliedFilters.state);
    }

    // Filtrar por período
    if (appliedFilters.dateRange !== 'all') {
      const days = parseInt(appliedFilters.dateRange);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      filtered = filtered.filter(alert => {
        const alertDate = new Date(alert.date);
        return alertDate >= cutoffDate;
      });
    }

    // Ordenar
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'severity':
          const severityOrder = { critical: 4, danger: 3, warning: 2, info: 1 };
          comparison = severityOrder[a.severity] - severityOrder[b.severity];
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredAlerts(filtered);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    const resetFilters = {
      severity: 'all',
      type: 'all',
      region: 'all',
      state: 'all',
      dateRange: '7'
    };
    setFilters(resetFilters);
    setAppliedFilters(resetFilters);
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'high_temperature':
      case 'low_temperature':
        return <Thermometer size={20} />;
      case 'heavy_rain':
      case 'flood':
        return <CloudRain size={20} />;
      case 'water_stress':
      case 'drought':
        return <Droplets size={20} />;
      case 'low_humidity':
        return <Droplets size={20} />;
      case 'high_wind':
        return <Wind size={20} />;
      default:
        return <AlertTriangle size={20} />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'danger': return '#fd7e14';
      case 'warning': return '#ffc107';
      case 'info': return '#17a2b8';
      default: return '#6c757d';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical': return 'Crítico';
      case 'danger': return 'Perigo';
      case 'warning': return 'Aviso';
      case 'info': return 'Informativo';
      default: return 'Desconhecido';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'high_temperature': return 'Temperatura Alta';
      case 'low_temperature': return 'Temperatura Baixa';
      case 'heavy_rain': return 'Chuva Intensa';
      case 'water_stress': return 'Estresse Hídrico';
      case 'low_humidity': return 'Baixa Umidade';
      case 'high_wind': return 'Vento Forte';
      case 'drought': return 'Seca';
      case 'flood': return 'Inundação';
      default: return 'Alerta Climático';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'high_temperature': return '#dc3545';
      case 'low_temperature': return '#17a2b8';
      case 'heavy_rain': return '#007bff';
      case 'water_stress': return '#fd7e14';
      case 'low_humidity': return '#ffc107';
      case 'high_wind': return '#6f42c1';
      case 'drought': return '#e83e8c';
      case 'flood': return '#20c997';
      default: return '#6c757d';
    }
  };

  const toggleDetails = (alertId: string) => {
    setShowDetails(prev => ({
      ...prev,
      [alertId]: !prev[alertId]
    }));
  };

  const exportAlerts = () => {
    const dataStr = JSON.stringify(filteredAlerts, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `alertas_climaticos_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getAlertStats = () => {
    const stats = {
      total: filteredAlerts.length,
      critical: filteredAlerts.filter(a => a.severity === 'critical').length,
      danger: filteredAlerts.filter(a => a.severity === 'danger').length,
      warning: filteredAlerts.filter(a => a.severity === 'warning').length,
      info: filteredAlerts.filter(a => a.severity === 'info').length
    };
    return stats;
  };

  const stats = getAlertStats();

  return (
    <Layout title="Alertas Climáticos">
      <div className="climate-alerts">
      <div className="alerts-header">
        <div className="header-left">
          <h2>Alertas Climáticos</h2>
          <div className="alert-stats">
            <div className="stat-item">
              <span className="stat-label">Total:</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-item critical">
              <span className="stat-label">Críticos:</span>
              <span className="stat-value">{stats.critical}</span>
            </div>
            <div className="stat-item danger">
              <span className="stat-label">Perigo:</span>
              <span className="stat-value">{stats.danger}</span>
            </div>
            <div className="stat-item warning">
              <span className="stat-label">Avisos:</span>
              <span className="stat-value">{stats.warning}</span>
            </div>
          </div>
        </div>
        
        <div className="header-controls">
          <button className="control-button" onClick={exportAlerts}>
            <Download size={20} />
            Exportar
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Severidade:</label>
            <select 
              value={filters.severity} 
              onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
            >
              <option value="all">Todas</option>
              <option value="critical">Crítico</option>
              <option value="danger">Perigo</option>
              <option value="warning">Aviso</option>
              <option value="info">Informativo</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Tipo:</label>
            <select 
              value={filters.type} 
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            >
              <option value="all">Todos</option>
              <option value="high_temperature">Temperatura Alta</option>
              <option value="low_temperature">Temperatura Baixa</option>
              <option value="heavy_rain">Chuva Intensa</option>
              <option value="water_stress">Estresse Hídrico</option>
              <option value="low_humidity">Baixa Umidade</option>
              <option value="high_wind">Vento Forte</option>
              <option value="drought">Seca</option>
              <option value="flood">Inundação</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Região:</label>
            <select 
              value={filters.region} 
              onChange={(e) => setFilters(prev => ({ ...prev, region: e.target.value }))}
            >
              <option value="all">Todas</option>
              <option value="Norte">Norte</option>
              <option value="Nordeste">Nordeste</option>
              <option value="Centro-Oeste">Centro-Oeste</option>
              <option value="Sudeste">Sudeste</option>
              <option value="Sul">Sul</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Período:</label>
            <select 
              value={filters.dateRange} 
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            >
              <option value="1">Últimas 24h</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="all">Todos</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Ordenar por:</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="date">Data</option>
              <option value="severity">Severidade</option>
              <option value="type">Tipo</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Ordem:</label>
            <select 
              value={sortOrder} 
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
          
          <div className="filter-actions">
            <button 
              className="apply-filters-btn"
              onClick={handleApplyFilters}
            >
              <Filter size={16} />
              Aplicar Filtros
            </button>
            <button 
              className="reset-filters-btn"
              onClick={handleResetFilters}
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="no-alerts">
            <AlertTriangle size={48} />
            <h3>Nenhum alerta encontrado</h3>
            <p>Não há alertas climáticos para os filtros selecionados.</p>
          </div>
        ) : (
          filteredAlerts.map(alert => (
            <div 
              key={alert.id} 
              className={`alert-card ${alert.severity}`}
              onClick={() => onAlertClick?.(alert)}
            >
              <div className="alert-header">
                <div className="alert-icon" style={{ color: getTypeColor(alert.type) }}>
                  {getAlertIcon(alert.type)}
                </div>
                
                <div className="alert-info">
                  <div className="alert-title">
                    <h4>{getTypeLabel(alert.type)}</h4>
                    <span 
                      className="severity-badge"
                      style={{ backgroundColor: getSeverityColor(alert.severity) }}
                    >
                      {getSeverityLabel(alert.severity)}
                    </span>
                  </div>
                  
                  <div className="alert-location">
                    <strong>{alert.location.name}</strong> - {alert.location.state} ({alert.location.region})
                  </div>
                  
                  <div className="alert-message">
                    {alert.message}
                  </div>
                </div>
                
                <div className="alert-actions">
                  <div className="alert-date">
                    {new Date(alert.date).toLocaleDateString('pt-BR')}
                  </div>
                  
                  <button 
                    className="details-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDetails(alert.id);
                    }}
                  >
                    {showDetails[alert.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    {showDetails[alert.id] ? 'Ocultar' : 'Detalhes'}
                  </button>
                </div>
              </div>
              
              {showDetails[alert.id] && (
                <div className="alert-details">
                  <div className="detail-section">
                    <h5>Valores Medidos</h5>
                    <div className="value-info">
                      <span className="value-label">Valor atual:</span>
                      <span className="value-current">{alert.value}</span>
                      <span className="value-label">Limite:</span>
                      <span className="value-threshold">{alert.threshold}</span>
                    </div>
                  </div>
                  
                  {alert.description && (
                    <div className="detail-section">
                      <h5>Descrição</h5>
                      <p>{alert.description}</p>
                    </div>
                  )}
                  
                  {alert.recommendations && alert.recommendations.length > 0 && (
                    <div className="detail-section">
                      <h5>Recomendações</h5>
                      <ul>
                        {alert.recommendations.map((rec, index) => (
                          <li key={index}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {(alert.affectedArea || alert.estimatedLoss) && (
                    <div className="detail-section">
                      <h5>Impacto Estimado</h5>
                      {alert.affectedArea && (
                        <div className="impact-item">
                          <span className="impact-label">Área afetada:</span>
                          <span className="impact-value">{alert.affectedArea.toLocaleString()} ha</span>
                        </div>
                      )}
                      {alert.estimatedLoss && (
                        <div className="impact-item">
                          <span className="impact-label">Perda estimada:</span>
                          <span className="impact-value">{alert.estimatedLoss.toLocaleString()} t</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      </div>
    </Layout>
  );
};

export default ClimateAlerts;
