import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Layers, Filter, Download, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import Layout from './Layout';
import 'leaflet/dist/leaflet.css';
import './ProductivityMap.css';

// Componente para controlar o mapa
const MapController: React.FC<{ geojsonData: any }> = ({ geojsonData }) => {
  const map = useMap();

  useEffect(() => {
    if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
      const bounds = geojsonData.bounds || [[-35, -75], [5, -30]];
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, geojsonData]);

  return null;
};

// Componente de legenda personalizada
const CustomLegend: React.FC<{ 
  data: any[], 
  colorScale: (value: number) => string,
  title: string,
  unit: string 
}> = ({ data, colorScale, title, unit }) => {
  if (!data || data.length === 0) return null;

  const values = data.map(d => d.productivity).filter(v => v != null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / 5;

  const legendItems = Array.from({ length: 6 }, (_, i) => {
    const value = min + (step * i);
    return {
      value: Math.round(value * 100) / 100,
      color: colorScale(value)
    };
  });

  return (
    <div className="custom-legend">
      <h4>{title}</h4>
      <div className="legend-items">
        {legendItems.map((item, index) => (
          <div key={index} className="legend-item">
            <div 
              className="legend-color" 
              style={{ backgroundColor: item.color }}
            ></div>
            <span>{item.value} {unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProductivityMap: React.FC = () => {
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    cropType: 'soja',
    region: '',
    state: ''
  });
  const [stats, setStats] = useState<any>(null);
  const [showControls, setShowControls] = useState(true);

  // Dados de exemplo para demonstração
  const mockProductivityData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Mato Grosso",
          state: "MT",
          region: "Centro-Oeste",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 3.2,
          plantedArea: 10500000,
          totalProduction: 33600000,
          historicalAverage: 3.0,
          variationFromAverage: 6.7,
          soilQualityIndex: 85,
          climateSuitabilityIndex: 78,
          technologyLevel: "alta",
          irrigationUsed: false,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-60.0, -17.0],
            [-52.0, -17.0],
            [-52.0, -8.0],
            [-60.0, -8.0],
            [-60.0, -17.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Paraná",
          state: "PR",
          region: "Sul",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 3.8,
          plantedArea: 5500000,
          totalProduction: 20900000,
          historicalAverage: 3.5,
          variationFromAverage: 8.6,
          soilQualityIndex: 92,
          climateSuitabilityIndex: 88,
          technologyLevel: "precisao",
          irrigationUsed: true,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-54.0, -26.0],
            [-50.0, -26.0],
            [-50.0, -22.0],
            [-54.0, -22.0],
            [-54.0, -26.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Rio Grande do Sul",
          state: "RS",
          region: "Sul",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 3.5,
          plantedArea: 6200000,
          totalProduction: 21700000,
          historicalAverage: 3.2,
          variationFromAverage: 9.4,
          soilQualityIndex: 88,
          climateSuitabilityIndex: 82,
          technologyLevel: "alta",
          irrigationUsed: false,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-57.0, -34.0],
            [-50.0, -34.0],
            [-50.0, -27.0],
            [-57.0, -27.0],
            [-57.0, -34.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Goiás",
          state: "GO",
          region: "Centro-Oeste",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 3.1,
          plantedArea: 3800000,
          totalProduction: 11780000,
          historicalAverage: 2.9,
          variationFromAverage: 6.9,
          soilQualityIndex: 82,
          climateSuitabilityIndex: 75,
          technologyLevel: "media",
          irrigationUsed: false,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-50.0, -19.0],
            [-48.0, -19.0],
            [-48.0, -15.0],
            [-50.0, -15.0],
            [-50.0, -19.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Bahia",
          state: "BA",
          region: "Nordeste",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 2.8,
          plantedArea: 1800000,
          totalProduction: 5040000,
          historicalAverage: 2.6,
          variationFromAverage: 7.7,
          soilQualityIndex: 75,
          climateSuitabilityIndex: 68,
          technologyLevel: "media",
          irrigationUsed: true,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-45.0, -18.0],
            [-40.0, -18.0],
            [-40.0, -10.0],
            [-45.0, -10.0],
            [-45.0, -18.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Maranhão",
          state: "MA",
          region: "Nordeste",
          year: 2024,
          season: "2024/25",
          cropType: "soja",
          productivity: 2.9,
          plantedArea: 2200000,
          totalProduction: 6380000,
          historicalAverage: 2.7,
          variationFromAverage: 7.4,
          soilQualityIndex: 78,
          climateSuitabilityIndex: 72,
          technologyLevel: "media",
          irrigationUsed: false,
          dataSource: "conab"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-47.0, -7.0],
            [-42.0, -7.0],
            [-42.0, -1.0],
            [-47.0, -1.0],
            [-47.0, -7.0]
          ]]
        }
      }
    ],
    bounds: [[-35, -75], [5, -30]]
  };

  useEffect(() => {
    loadProductivityData();
  }, [filters]);

  const loadProductivityData = async () => {
    setLoading(true);
    try {
      // Simular carregamento de dados
      setTimeout(() => {
        setGeojsonData(mockProductivityData);
        calculateStats(mockProductivityData);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Erro ao carregar dados de produtividade:', error);
      setLoading(false);
    }
  };

  const calculateStats = (data: any) => {
    if (!data || !data.features) return;

    const values = data.features.map((f: any) => f.properties.productivity);
    const validValues = values.filter((v: number) => v != null);

    if (validValues.length === 0) return;

    const stats = {
      min: Math.min(...validValues),
      max: Math.max(...validValues),
      avg: validValues.reduce((a: number, b: number) => a + b, 0) / validValues.length,
      total: validValues.length,
      totalArea: data.features.reduce((sum: number, f: any) => sum + f.properties.plantedArea, 0),
      totalProduction: data.features.reduce((sum: number, f: any) => sum + f.properties.totalProduction, 0)
    };

    setStats(stats);
  };

  const getProductivityColor = (productivity: number) => {
    if (!stats) return '#cccccc';
    
    const normalized = (productivity - stats.min) / (stats.max - stats.min);
    
    if (normalized < 0.2) return '#d73027'; // Vermelho - baixa produtividade
    if (normalized < 0.4) return '#fc8d59'; // Laranja
    if (normalized < 0.6) return '#fee08b'; // Amarelo
    if (normalized < 0.8) return '#d9ef8b'; // Verde claro
    return '#1a9850'; // Verde escuro - alta produtividade
  };

  const getVariationColor = (variation: number) => {
    if (variation > 10) return '#1a9850'; // Verde - muito positivo
    if (variation > 5) return '#91cf60'; // Verde claro - positivo
    if (variation > -5) return '#ffffbf'; // Amarelo - neutro
    if (variation > -10) return '#fc8d59'; // Laranja - negativo
    return '#d73027'; // Vermelho - muito negativo
  };

  const onEachFeature = (feature: any, layer: any) => {
    const props = feature.properties;
    
    layer.bindPopup(`
      <div class="productivity-popup">
        <h3>${props.name} (${props.state})</h3>
        <div class="popup-section">
          <h4>Produtividade</h4>
          <p><strong>Atual:</strong> ${props.productivity} t/ha</p>
          <p><strong>Histórica:</strong> ${props.historicalAverage} t/ha</p>
          <p><strong>Variação:</strong> <span style="color: ${getVariationColor(props.variationFromAverage)}">${props.variationFromAverage > 0 ? '+' : ''}${props.variationFromAverage}%</span></p>
        </div>
        <div class="popup-section">
          <h4>Área e Produção</h4>
          <p><strong>Área plantada:</strong> ${props.plantedArea.toLocaleString()} ha</p>
          <p><strong>Produção total:</strong> ${props.totalProduction.toLocaleString()} t</p>
        </div>
        <div class="popup-section">
          <h4>Indicadores</h4>
          <p><strong>Qualidade do solo:</strong> ${props.soilQualityIndex}%</p>
          <p><strong>Adequação climática:</strong> ${props.climateSuitabilityIndex}%</p>
          <p><strong>Tecnologia:</strong> ${props.technologyLevel}</p>
          <p><strong>Irrigação:</strong> ${props.irrigationUsed ? 'Sim' : 'Não'}</p>
        </div>
      </div>
    `);

  };

  const style = (feature: any) => {
    const productivity = feature.properties?.productivity || 0;
    return {
      fillColor: getProductivityColor(productivity),
      weight: 2,
      opacity: 1,
      color: 'white',
      dashArray: '3',
      fillOpacity: 0.7
    };

  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const exportData = () => {
    if (!geojsonData) return;
    
    const dataStr = JSON.stringify(geojsonData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `produtividade_${filters.year}_${filters.cropType}.geojson`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <Layout title="Mapa de Produtividade">
      <div className="productivity-map-container">
        {/* Header com controles */}
        <div className="map-header">
          <div className="header-left">
            <h2>Mapa de Produtividade Agrícola</h2>
            <div className="header-stats">
              {stats && (
                <>
                  <div className="stat-item">
                    <span className="stat-label">Produtividade Média:</span>
                    <span className="stat-value">{stats.avg.toFixed(1)} t/ha</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Área Total:</span>
                    <span className="stat-value">{stats.totalArea.toLocaleString()} ha</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Produção Total:</span>
                    <span className="stat-value">{stats.totalProduction.toLocaleString()} t</span>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="header-controls">
            <button 
              className="control-button"
              onClick={() => setShowControls(!showControls)}
            >
              <Filter size={20} />
              Filtros
            </button>
            <button className="control-button" onClick={exportData}>
              <Download size={20} />
              Exportar
            </button>
          </div>
        </div>

        {/* Painel de filtros */}
        {showControls && (
          <div className="filters-panel">
            <div className="filter-group">
              <label>Ano:</label>
              <select 
                value={filters.year} 
                onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
              >
                <option value={2024}>2024</option>
                <option value={2023}>2023</option>
                <option value={2022}>2022</option>
                <option value={2021}>2021</option>
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
              <label>Região:</label>
              <select 
                value={filters.region} 
                onChange={(e) => handleFilterChange('region', e.target.value)}
              >
                <option value="">Todas</option>
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
                <option value="">Todos</option>
                <option value="MT">Mato Grosso</option>
                <option value="PR">Paraná</option>
                <option value="RS">Rio Grande do Sul</option>
                <option value="GO">Goiás</option>
                <option value="BA">Bahia</option>
                <option value="MA">Maranhão</option>
              </select>
            </div>
          </div>
        )}

        {/* Mapa */}
        <div className="map-wrapper">
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Carregando dados de produtividade...</p>
            </div>
          ) : (
            <MapContainer
              center={[-15, -47]}
              zoom={5}
              className="leaflet-map-container"
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {geojsonData && (
                <GeoJSON
                  data={geojsonData}
                  onEachFeature={onEachFeature}
                  style={style}
                />
              )}
              <MapController geojsonData={geojsonData} />
            </MapContainer>
          )}
        </div>

        {/* Legenda */}
        {geojsonData && (
          <CustomLegend
            data={geojsonData.features}
            colorScale={getProductivityColor}
            title="Produtividade (t/ha)"
            unit="t/ha"
          />
        )}

      </div>
    </Layout>
  );
};

export default ProductivityMap;

