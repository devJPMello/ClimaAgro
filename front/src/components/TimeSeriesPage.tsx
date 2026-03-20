import React, { useState, useEffect } from 'react';
import { TrendingUp, BarChart3, Filter, Download, RefreshCw } from 'lucide-react';
import TimeSeriesChart from './TimeSeriesChart';
import Layout from './Layout';
import './TimeSeriesPage.css';

interface TimeSeriesData {
  date: string;
  year: number;
  month?: number;
  productivity?: number;
  avgTemperature?: number;
  maxTemperature?: number;
  minTemperature?: number;
  precipitation?: number;
  humidity?: number;
  windSpeed?: number;
  solarRadiation?: number;
  evapotranspiration?: number;
  plantedArea?: number;
  totalProduction?: number;
  historicalAverage?: number;
  variationFromAverage?: number;
}

const TimeSeriesPage: React.FC = () => {
  const [productivityData, setProductivityData] = useState<TimeSeriesData[]>([]);
  const [climateData, setClimateData] = useState<TimeSeriesData[]>([]);
  const [comparisonData, setComparisonData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    region: 'all',
    state: 'all',
    cropType: 'soja',
    startYear: 2020,
    endYear: 2024
  });

  // Estados para controles dos gráficos
  const [chartControls, setChartControls] = useState({
    productivity: { type: 'line' as 'line' | 'bar' | 'area', period: 'all' as 'all' | 'year' | 'month' },
    climate: { type: 'line' as 'line' | 'bar' | 'area', period: 'all' as 'all' | 'year' | 'month' },
    comparison: { type: 'line' as 'line' | 'bar' | 'area', period: 'all' as 'all' | 'year' | 'month' }
  });

  // Dados de exemplo para demonstração
  const mockProductivityData: TimeSeriesData[] = [
    { date: '2020-01-01', year: 2020, productivity: 2.8, plantedArea: 1000000, totalProduction: 2800000, historicalAverage: 2.6, variationFromAverage: 7.7 },
    { date: '2021-01-01', year: 2021, productivity: 3.1, plantedArea: 1100000, totalProduction: 3410000, historicalAverage: 2.8, variationFromAverage: 10.7 },
    { date: '2022-01-01', year: 2022, productivity: 2.9, plantedArea: 1050000, totalProduction: 3045000, historicalAverage: 2.9, variationFromAverage: 0.0 },
    { date: '2023-01-01', year: 2023, productivity: 3.3, plantedArea: 1200000, totalProduction: 3960000, historicalAverage: 3.0, variationFromAverage: 10.0 },
    { date: '2024-01-01', year: 2024, productivity: 3.2, plantedArea: 1150000, totalProduction: 3680000, historicalAverage: 3.1, variationFromAverage: 3.2 }
  ];

  const mockClimateData: TimeSeriesData[] = [
    { date: '2020-01-01', year: 2020, avgTemperature: 24.5, maxTemperature: 32.1, minTemperature: 18.2, precipitation: 1200, humidity: 75, windSpeed: 12.5, solarRadiation: 18.5, evapotranspiration: 850 },
    { date: '2021-01-01', year: 2021, avgTemperature: 25.2, maxTemperature: 33.8, minTemperature: 19.1, precipitation: 1100, humidity: 72, windSpeed: 13.2, solarRadiation: 19.2, evapotranspiration: 920 },
    { date: '2022-01-01', year: 2022, avgTemperature: 24.8, maxTemperature: 31.5, minTemperature: 17.8, precipitation: 1300, humidity: 78, windSpeed: 11.8, solarRadiation: 18.8, evapotranspiration: 880 },
    { date: '2023-01-01', year: 2023, avgTemperature: 25.8, maxTemperature: 34.2, minTemperature: 19.5, precipitation: 1050, humidity: 70, windSpeed: 14.1, solarRadiation: 19.8, evapotranspiration: 950 },
    { date: '2024-01-01', year: 2024, avgTemperature: 25.1, maxTemperature: 33.5, minTemperature: 18.9, precipitation: 1150, humidity: 73, windSpeed: 12.8, solarRadiation: 19.1, evapotranspiration: 890 }
  ];

  const mockComparisonData: TimeSeriesData[] = [
    { date: '2020-01-01', year: 2020, productivity: 2.8, avgTemperature: 24.5, precipitation: 1200 },
    { date: '2021-01-01', year: 2021, productivity: 3.1, avgTemperature: 25.2, precipitation: 1100 },
    { date: '2022-01-01', year: 2022, productivity: 2.9, avgTemperature: 24.8, precipitation: 1300 },
    { date: '2023-01-01', year: 2023, productivity: 3.3, avgTemperature: 25.8, precipitation: 1050 },
    { date: '2024-01-01', year: 2024, productivity: 3.2, avgTemperature: 25.1, precipitation: 1150 }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    // Simular carregamento de dados
    setTimeout(() => {
      setProductivityData(mockProductivityData);
      setClimateData(mockClimateData);
      setComparisonData(mockComparisonData);
      setLoading(false);
    }, 1000);
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleChartControlChange = (chartType: string, controlType: string, value: string) => {
    setChartControls(prev => ({
      ...prev,
      [chartType]: {
        ...prev[chartType as keyof typeof prev],
        [controlType]: value
      }
    }));
  };

  const exportData = (type: string) => {
    let dataToExport: TimeSeriesData[];
    let filename: string;

    switch (type) {
      case 'productivity':
        dataToExport = productivityData;
        filename = 'produtividade_agricola.json';
        break;
      case 'climate':
        dataToExport = climateData;
        filename = 'variaveis_climaticas.json';
        break;
      case 'comparison':
        dataToExport = comparisonData;
        filename = 'comparacao_clima_produtividade.json';
        break;
      default:
        return;
    }

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', filename);
    linkElement.click();
  };

  if (loading) {
    return (
      <Layout title="Séries Temporais">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Carregando dados de séries temporais...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Séries Temporais">
      <div className="time-series-page">
        {/* Header */}
        <div className="page-header">
          <div className="header-content">
            <h2>Análise de Séries Temporais</h2>
            <p>Compare dados de produtividade agrícola com variáveis climáticas ao longo do tempo</p>
          </div>
          
          <div className="header-controls">
            <button className="control-button primary">
              <RefreshCw size={20} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters-panel">
          <div className="filter-group">
            <label>Região:</label>
            <select 
              value={filters.region} 
              onChange={(e) => handleFilterChange('region', e.target.value)}
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
            <label>Estado:</label>
            <select 
              value={filters.state} 
              onChange={(e) => handleFilterChange('state', e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="MT">Mato Grosso</option>
              <option value="PR">Paraná</option>
              <option value="RS">Rio Grande do Sul</option>
              <option value="GO">Goiás</option>
              <option value="BA">Bahia</option>
              <option value="MA">Maranhão</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Cultura:</label>
            <select 
              value={filters.cropType} 
              onChange={(e) => handleFilterChange('cropType', e.target.value)}
            >
              <option value="soja">Soja</option>
              <option value="milho">Milho</option>
              <option value="cafe">Café</option>
              <option value="cana">Cana-de-açúcar</option>
              <option value="algodao">Algodão</option>
              <option value="trigo">Trigo</option>
              <option value="arroz">Arroz</option>
              <option value="feijao">Feijão</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Ano Inicial:</label>
            <select 
              value={filters.startYear} 
              onChange={(e) => handleFilterChange('startYear', parseInt(e.target.value))}
            >
              <option value={2015}>2015</option>
              <option value={2016}>2016</option>
              <option value={2017}>2017</option>
              <option value={2018}>2018</option>
              <option value={2019}>2019</option>
              <option value={2020}>2020</option>
              <option value={2021}>2021</option>
              <option value={2022}>2022</option>
              <option value={2023}>2023</option>
              <option value={2024}>2024</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Ano Final:</label>
            <select 
              value={filters.endYear} 
              onChange={(e) => handleFilterChange('endYear', parseInt(e.target.value))}
            >
              <option value={2020}>2020</option>
              <option value={2021}>2021</option>
              <option value={2022}>2022</option>
              <option value={2023}>2023</option>
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>

        {/* Gráficos */}
        <div className="charts-grid">
          {/* Gráfico de Produtividade */}
          <div className="chart-container">
            <div className="chart-header">
              <h3>Evolução da Produtividade</h3>
              <button 
                className="export-button"
                onClick={() => exportData('productivity')}
              >
                <Download size={10} />
                Exportar
              </button>
            </div>
            <div className="chart-controls">
              <div className="control-group">
                <label>TIPO:</label>
                <select
                  value={chartControls.productivity.type}
                  onChange={(e) => handleChartControlChange('productivity', 'type', e.target.value)}
                >
                  <option value="line">Linha</option>
                  <option value="bar">Barras</option>
                  <option value="area">Área</option>
                </select>
              </div>
              <div className="control-group">
                <label>PERÍODO:</label>
                <select
                  value={chartControls.productivity.period}
                  onChange={(e) => handleChartControlChange('productivity', 'period', e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="year">Anual</option>
                  <option value="month">Mensal</option>
                </select>
              </div>
            </div>
            <div className="chart-placeholder">
              <TimeSeriesChart
                data={productivityData}
                type="productivity"
                title="Evolução da Produtividade"
                height={200}
                chartType={chartControls.productivity.type}
                timeRange={chartControls.productivity.period}
              />
            </div>
          </div>

          {/* Gráfico Climático */}
          <div className="chart-container">
            <div className="chart-header">
              <h3>Condições Climáticas</h3>
              <button 
                className="export-button"
                onClick={() => exportData('climate')}
              >
                <Download size={10} />
                Exportar
              </button>
            </div>
            <div className="chart-controls">
              <div className="control-group">
                <label>TIPO:</label>
                <select
                  value={chartControls.climate.type}
                  onChange={(e) => handleChartControlChange('climate', 'type', e.target.value)}
                >
                  <option value="line">Linha</option>
                  <option value="bar">Barras</option>
                  <option value="area">Área</option>
                </select>
              </div>
              <div className="control-group">
                <label>PERÍODO:</label>
                <select
                  value={chartControls.climate.period}
                  onChange={(e) => handleChartControlChange('climate', 'period', e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="year">Anual</option>
                  <option value="month">Mensal</option>
                </select>
              </div>
            </div>
            <div className="chart-placeholder">
              <TimeSeriesChart
                data={climateData}
                type="climate"
                title="Condições Climáticas"
                height={200}
                chartType={chartControls.climate.type}
                timeRange={chartControls.climate.period}
              />
            </div>
          </div>

          {/* Gráfico de Comparação */}
          <div className="chart-container full-width">
            <div className="chart-header">
              <h3>Relação entre Clima e Produtividade</h3>
              <button 
                className="export-button"
                onClick={() => exportData('comparison')}
              >
                <Download size={10} />
                Exportar
              </button>
            </div>
            <div className="chart-controls">
              <div className="control-group">
                <label>TIPO:</label>
                <select
                  value={chartControls.comparison.type}
                  onChange={(e) => handleChartControlChange('comparison', 'type', e.target.value)}
                >
                  <option value="line">Linha</option>
                  <option value="bar">Barras</option>
                  <option value="area">Área</option>
                </select>
              </div>
              <div className="control-group">
                <label>PERÍODO:</label>
                <select
                  value={chartControls.comparison.period}
                  onChange={(e) => handleChartControlChange('comparison', 'period', e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="year">Anual</option>
                  <option value="month">Mensal</option>
                </select>
              </div>
            </div>
            <div className="chart-placeholder">
              <TimeSeriesChart
                data={comparisonData}
                type="comparison"
                title="Relação entre Clima e Produtividade"
                height={200}
                chartType={chartControls.comparison.type}
                timeRange={chartControls.comparison.period}
              />
            </div>
          </div>
        </div>

        {/* Resumo Estatístico */}
        <div className="stats-summary">
          <h3>Resumo Estatístico</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Produtividade</h4>
              <div className="stat-values">
                <div className="stat-item">
                  <span className="label">Média:</span>
                  <span className="value">3.1 t/ha</span>
                </div>
                <div className="stat-item">
                  <span className="label">Máxima:</span>
                  <span className="value">3.3 t/ha</span>
                </div>
                <div className="stat-item">
                  <span className="label">Mínima:</span>
                  <span className="value">2.8 t/ha</span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <h4>Temperatura</h4>
              <div className="stat-values">
                <div className="stat-item">
                  <span className="label">Média:</span>
                  <span className="value">25.1°C</span>
                </div>
                <div className="stat-item">
                  <span className="label">Máxima:</span>
                  <span className="value">34.2°C</span>
                </div>
                <div className="stat-item">
                  <span className="label">Mínima:</span>
                  <span className="value">17.8°C</span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <h4>Precipitação</h4>
              <div className="stat-values">
                <div className="stat-item">
                  <span className="label">Total:</span>
                  <span className="value">5800 mm</span>
                </div>
                <div className="stat-item">
                  <span className="label">Média Anual:</span>
                  <span className="value">1160 mm</span>
                </div>
                <div className="stat-item">
                  <span className="label">Máxima:</span>
                  <span className="value">1300 mm</span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <h4>Produção Total</h4>
              <div className="stat-values">
                <div className="stat-item">
                  <span className="label">Total:</span>
                  <span className="value">16.9M t</span>
                </div>
                <div className="stat-item">
                  <span className="label">Área Média:</span>
                  <span className="value">1.1M ha</span>
                </div>
                <div className="stat-item">
                  <span className="label">Crescimento:</span>
                  <span className="value">14.3%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TimeSeriesPage;