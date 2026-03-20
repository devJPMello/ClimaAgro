import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, BarChart3, CloudRain, Thermometer, Droplets, Wind, Sun } from 'lucide-react';
import './TimeSeriesChart.css';

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

interface TimeSeriesChartProps {
  data: TimeSeriesData[];
  type: 'productivity' | 'climate' | 'comparison';
  title: string;
  height?: number;
  showControls?: boolean;
  onDataPointClick?: (data: any) => void;
  chartType?: 'line' | 'bar' | 'area';
  timeRange?: 'all' | 'year' | 'month';
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  type,
  title,
  height = 400,
  showControls = true,
  onDataPointClick,
  chartType = 'line',
  timeRange = 'all'
}) => {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [filteredData, setFilteredData] = useState<TimeSeriesData[]>(data);

  const processDataByTimeRange = (data: TimeSeriesData[], range: string) => {
    if (range === 'year') {
      // Agrupar dados por ano - já estão agrupados por ano nos dados mock
      return data;
    } else if (range === 'month') {
      // Gerar dados mensais para o último ano (2024)
      const monthlyData: TimeSeriesData[] = [];
      const currentYear = 2024;
      
      for (let month = 1; month <= 12; month++) {
        const baseData = data.find(d => d.year === currentYear) || data[data.length - 1];
        const variation = (Math.random() - 0.5) * 0.2; // Variação de ±10%
        
        monthlyData.push({
          ...baseData,
          date: `${currentYear}-${month.toString().padStart(2, '0')}-01`,
          year: currentYear,
          month: month,
          productivity: baseData.productivity ? baseData.productivity * (1 + variation) : undefined,
          avgTemperature: baseData.avgTemperature ? baseData.avgTemperature * (1 + variation) : undefined,
          precipitation: baseData.precipitation ? baseData.precipitation * (1 + variation) : undefined,
          humidity: baseData.humidity ? baseData.humidity * (1 + variation) : undefined,
          plantedArea: baseData.plantedArea ? baseData.plantedArea * (1 + variation) : undefined,
          totalProduction: baseData.totalProduction ? baseData.totalProduction * (1 + variation) : undefined,
          historicalAverage: baseData.historicalAverage ? baseData.historicalAverage * (1 + variation) : undefined,
          variationFromAverage: baseData.variationFromAverage ? baseData.variationFromAverage * (1 + variation) : undefined
        });
      }
      
      return monthlyData;
    } else {
      // Mostrar todos os dados
      return data;
    }
  };

  useEffect(() => {
    const processedData = processDataByTimeRange(data, timeRange);
    setFilteredData(processedData);
    initializeSelectedMetrics();
  }, [data, type, chartType, timeRange]);

  const initializeSelectedMetrics = () => {
    if (type === 'productivity') {
      setSelectedMetrics(['productivity', 'historicalAverage']);
    } else if (type === 'climate') {
      setSelectedMetrics(['avgTemperature', 'precipitation', 'humidity']);
    } else if (type === 'comparison') {
      setSelectedMetrics(['productivity', 'avgTemperature', 'precipitation']);
    }
  };


  const renderSimpleChart = () => {
    if (filteredData.length === 0) {
      return (
        <div className="no-data-chart">
          <p>Nenhum dado disponível para exibir</p>
        </div>
      );
    }

    const maxValue = Math.max(...filteredData.map(d => 
      Math.max(...selectedMetrics.map(metric => d[metric as keyof TimeSeriesData] as number || 0))
    ));

    const renderChartContent = () => {
      if (chartType === 'bar') {
        // Renderizar gráfico de barras
        return selectedMetrics.map((metric, metricIndex) => {
          const barWidth = 700 / (filteredData.length * selectedMetrics.length) * 0.8;
          const barSpacing = 700 / (filteredData.length * selectedMetrics.length);
          
          return (
            <g key={metric}>
              {filteredData.map((d, index) => {
                const value = d[metric as keyof TimeSeriesData] as number || 0;
                const x = 50 + (index * 700 / filteredData.length) + (metricIndex * barSpacing) - (barWidth * selectedMetrics.length / 2);
                const y = height - 50 - ((value / maxValue) * (height - 100));
                const barHeight = height - 50 - y;
                
                return (
                  <rect
                    key={index}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={getMetricColor(metric)}
                    onClick={() => onDataPointClick?.(d)}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </g>
          );
        });
      } else if (chartType === 'area') {
        // Renderizar gráfico de área
        return selectedMetrics.map((metric, metricIndex) => {
          const points = filteredData.map((d, index) => {
            const value = d[metric as keyof TimeSeriesData] as number || 0;
            const x = 50 + (index * 700 / (filteredData.length - 1));
            const y = height - 50 - ((value / maxValue) * (height - 100));
            return `${x},${y}`;
          }).join(' L');
          
          const areaPath = `M 50,${height - 50} L ${points} L ${50 + (filteredData.length - 1) * 700 / (filteredData.length - 1)},${height - 50} Z`;

          return (
            <g key={metric}>
              <path
                d={areaPath}
                fill={getMetricColor(metric)}
                fillOpacity="0.3"
                stroke={getMetricColor(metric)}
                strokeWidth="2"
              />
              {filteredData.map((d, index) => {
                const value = d[metric as keyof TimeSeriesData] as number || 0;
                const x = 50 + (index * 700 / (filteredData.length - 1));
                const y = height - 50 - ((value / maxValue) * (height - 100));
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={getMetricColor(metric)}
                    onClick={() => onDataPointClick?.(d)}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </g>
          );
        });
      } else {
        // Renderizar gráfico de linha (padrão)
        return selectedMetrics.map((metric, metricIndex) => {
          const points = filteredData.map((d, index) => {
            const value = d[metric as keyof TimeSeriesData] as number || 0;
            const x = 50 + (index * 700 / (filteredData.length - 1));
            const y = height - 50 - ((value / maxValue) * (height - 100));
            return `${x},${y}`;
          }).join(' L');

          return (
            <g key={metric}>
              <path
                d={`M ${points}`}
                fill="none"
                stroke={getMetricColor(metric)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {filteredData.map((d, index) => {
                const value = d[metric as keyof TimeSeriesData] as number || 0;
                const x = 50 + (index * 700 / (filteredData.length - 1));
                const y = height - 50 - ((value / maxValue) * (height - 100));
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={getMetricColor(metric)}
                    onClick={() => onDataPointClick?.(d)}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </g>
          );
        });
      }
    };

    return (
      <div className="simple-chart">
        <div className="chart-svg">
          <svg width="100%" height={height} viewBox={`0 0 800 ${height}`}>
            {/* Grid lines */}
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={i}
                x1="50"
                y1={50 + (i * (height - 100) / 4)}
                x2="750"
                y2={50 + (i * (height - 100) / 4)}
                stroke="#e0e0e0"
                strokeWidth="1"
              />
            ))}
            
            {/* Chart content based on type */}
            {renderChartContent()}
            
            {/* X-axis labels */}
            {filteredData.map((d, index) => {
              const x = 50 + (index * 700 / (filteredData.length - 1));
              let label = '';
              
              if (timeRange === 'month') {
                // Mostrar apenas o mês para dados mensais
                const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                                  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                label = monthNames[(d.month || 1) - 1];
              } else if (timeRange === 'year') {
                // Mostrar apenas o ano para dados anuais
                label = d.year.toString();
              } else {
                // Mostrar data completa para todos os dados
                label = d.date;
              }
              
              return (
                <text
                  key={index}
                  x={x}
                  y={height - 20}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#666"
                >
                  {label}
                </text>
              );
            })}
          </svg>
        </div>
        
        {/* Legend */}
        <div className="chart-legend">
          {selectedMetrics.map(metric => (
            <div key={metric} className="legend-item">
              <div 
                className="legend-color"
                style={{ backgroundColor: getMetricColor(metric) }}
              ></div>
              <span>{getMetricLabel(metric)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getMetricColor = (metric: string): string => {
    const colors: { [key: string]: string } = {
      productivity: '#1a9850',
      historicalAverage: '#91cf60',
      avgTemperature: '#d73027',
      maxTemperature: '#fc8d59',
      minTemperature: '#fee08b',
      precipitation: '#4575b4',
      humidity: '#74add1',
      windSpeed: '#abd9e9',
      solarRadiation: '#e0f3f8',
      evapotranspiration: '#313695',
      plantedArea: '#762a83',
      totalProduction: '#5aae61',
      variationFromAverage: '#f46d43'
    };
    return colors[metric] || '#8884d8';
  };

  const getMetricLabel = (metric: string): string => {
    const labels: { [key: string]: string } = {
      productivity: 'Produtividade (t/ha)',
      historicalAverage: 'Média Histórica (t/ha)',
      avgTemperature: 'Temperatura Média (°C)',
      maxTemperature: 'Temperatura Máxima (°C)',
      minTemperature: 'Temperatura Mínima (°C)',
      precipitation: 'Precipitação (mm)',
      humidity: 'Umidade (%)',
      windSpeed: 'Velocidade do Vento (km/h)',
      solarRadiation: 'Radiação Solar (MJ/m²)',
      evapotranspiration: 'Evapotranspiração (mm)',
      plantedArea: 'Área Plantada (ha)',
      totalProduction: 'Produção Total (t)',
      variationFromAverage: 'Variação da Média (%)'
    };
    return labels[metric] || metric;
  };

  const getAvailableMetrics = (): string[] => {
    if (type === 'productivity') {
      return ['productivity', 'historicalAverage', 'plantedArea', 'totalProduction', 'variationFromAverage'];
    } else if (type === 'climate') {
      return ['avgTemperature', 'maxTemperature', 'minTemperature', 'precipitation', 'humidity', 'windSpeed', 'solarRadiation', 'evapotranspiration'];
    } else if (type === 'comparison') {
      return ['productivity', 'avgTemperature', 'precipitation', 'humidity', 'plantedArea', 'totalProduction'];
    }
    return [];
  };

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics(prev => 
      prev.includes(metric) 
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const getChartIcon = () => {
    switch (chartType) {
      case 'bar': return <BarChart3 size={20} />;
      case 'area': return <TrendingUp size={20} />;
      default: return <TrendingUp size={20} />;
    }
  };

  return (
    <div className="time-series-chart">
      <div className="chart-header">
        <div className="header-left">
          <h3>{title}</h3>
          <div className="chart-type-indicator">
            {getChartIcon()}
            <span>{chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart</span>
          </div>
        </div>
        
      </div>

      <div className="chart-content">
        <div className="chart-wrapper">
          {renderSimpleChart()}
        </div>
        
        {showControls && (
          <div className="metrics-controls">
            <h4>Métricas:</h4>
            <div className="metrics-grid">
              {getAvailableMetrics().map(metric => (
                <label key={metric} className="metric-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={() => handleMetricToggle(metric)}
                  />
                  <span 
                    className="metric-color"
                    style={{ backgroundColor: getMetricColor(metric) }}
                  ></span>
                  <span className="metric-label">{getMetricLabel(metric)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {filteredData.length === 0 && (
        <div className="no-data">
          <p>Nenhum dado disponível para o período selecionado</p>
        </div>
      )}
    </div>
  );
};

export default TimeSeriesChart;
