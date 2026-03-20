import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Layers } from 'lucide-react';
import Layout from './Layout';
import 'leaflet/dist/leaflet.css';
import './InteractiveMap.css';

// Componente para controlar o mapa
const MapController: React.FC<{ geojsonData: any }> = ({ geojsonData }) => {
  const map = useMap();

  useEffect(() => {
    if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
      // Apenas ajustar os bounds na primeira vez, sem forçar reajuste
      const bounds = geojsonData.bounds || [[-20, -60], [5, -30]];
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map]); // Removido geojsonData das dependências para evitar reajuste constante

  return null;
};

const InteractiveMap: React.FC = () => {
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dados GeoJSON simulados para o Brasil
  const mockGeoJSON = {
    type: "FeatureCollection",
    features: [
      // Região Norte
      {
        type: "Feature",
        properties: {
          name: "Amazonas",
          state: "AM",
          temperature: 32,
          humidity: 85,
          precipitation: 45
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-70.0, -5.0],
            [-65.0, -5.0],
            [-65.0, -2.0],
            [-70.0, -2.0],
            [-70.0, -5.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Pará",
          state: "PA",
          temperature: 30,
          humidity: 80,
          precipitation: 40
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-55.0, -2.0],
            [-50.0, -2.0],
            [-50.0, 1.0],
            [-55.0, 1.0],
            [-55.0, -2.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Rondônia",
          state: "RO",
          temperature: 29,
          humidity: 75,
          precipitation: 35
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-65.0, -12.0],
            [-60.0, -12.0],
            [-60.0, -8.0],
            [-65.0, -8.0],
            [-65.0, -12.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Acre",
          state: "AC",
          temperature: 28,
          humidity: 78,
          precipitation: 38
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-70.0, -12.0],
            [-65.0, -12.0],
            [-65.0, -8.0],
            [-70.0, -8.0],
            [-70.0, -12.0]
          ]]
        }
      },
      // Região Nordeste
      {
        type: "Feature",
        properties: {
          name: "Bahia",
          state: "BA",
          temperature: 27,
          humidity: 70,
          precipitation: 20
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
          name: "Ceará",
          state: "CE",
          temperature: 31,
          humidity: 65,
          precipitation: 15
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-40.0, -7.0],
            [-37.0, -7.0],
            [-37.0, -3.0],
            [-40.0, -3.0],
            [-40.0, -7.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Pernambuco",
          state: "PE",
          temperature: 29,
          humidity: 68,
          precipitation: 18
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-37.0, -10.0],
            [-34.0, -10.0],
            [-34.0, -7.0],
            [-37.0, -7.0],
            [-37.0, -10.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Maranhão",
          state: "MA",
          temperature: 30,
          humidity: 72,
          precipitation: 25
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
      },
      // Região Centro-Oeste
      {
        type: "Feature",
        properties: {
          name: "Tocantins",
          state: "TO",
          temperature: 28,
          humidity: 65,
          precipitation: 15
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-48.5, -11.0],
            [-47.0, -11.0],
            [-47.0, -9.0],
            [-48.5, -9.0],
            [-48.5, -11.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Goiás",
          state: "GO",
          temperature: 26,
          humidity: 70,
          precipitation: 20
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
          name: "Mato Grosso",
          state: "MT",
          temperature: 29,
          humidity: 68,
          precipitation: 22
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
          name: "Mato Grosso do Sul",
          state: "MS",
          temperature: 25,
          humidity: 72,
          precipitation: 28
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-58.0, -24.0],
            [-52.0, -24.0],
            [-52.0, -18.0],
            [-58.0, -18.0],
            [-58.0, -24.0]
          ]]
        }
      },
      // Região Sudeste
      {
        type: "Feature",
        properties: {
          name: "São Paulo",
          state: "SP",
          temperature: 24,
          humidity: 75,
          precipitation: 25
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-48.0, -25.0],
            [-46.0, -25.0],
            [-46.0, -23.0],
            [-48.0, -23.0],
            [-48.0, -25.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Minas Gerais",
          state: "MG",
          temperature: 22,
          humidity: 80,
          precipitation: 30
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-46.0, -22.0],
            [-44.0, -22.0],
            [-44.0, -20.0],
            [-46.0, -20.0],
            [-46.0, -22.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Rio de Janeiro",
          state: "RJ",
          temperature: 26,
          humidity: 78,
          precipitation: 32
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-45.0, -24.0],
            [-42.0, -24.0],
            [-42.0, -21.0],
            [-45.0, -21.0],
            [-45.0, -24.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Espírito Santo",
          state: "ES",
          temperature: 27,
          humidity: 76,
          precipitation: 28
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-42.0, -21.0],
            [-39.0, -21.0],
            [-39.0, -18.0],
            [-42.0, -18.0],
            [-42.0, -21.0]
          ]]
        }
      },
      // Região Sul
      {
        type: "Feature",
        properties: {
          name: "Paraná",
          state: "PR",
          temperature: 20,
          humidity: 82,
          precipitation: 35
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
          name: "Santa Catarina",
          state: "SC",
          temperature: 18,
          humidity: 85,
          precipitation: 40
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-54.0, -29.0],
            [-49.0, -29.0],
            [-49.0, -25.0],
            [-54.0, -25.0],
            [-54.0, -29.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          name: "Rio Grande do Sul",
          state: "RS",
          temperature: 16,
          humidity: 88,
          precipitation: 45
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
      }
    ],
    bounds: [[-35, -75], [5, -30]]
  };

  useEffect(() => {
    // Simular carregamento de dados GeoJSON
    setTimeout(() => {
      setGeojsonData(mockGeoJSON);
      setLoading(false);
    }, 1000);
  }, [mockGeoJSON]);

  const onEachFeature = (feature: any, layer: any) => {
    if (feature.properties) {
      const { name, state, temperature, humidity, precipitation } = feature.properties;
      
      layer.bindPopup(`
        <div class="popup-content">
          <h3>${name} (${state})</h3>
          <div class="weather-info">
            <p><strong>Temperatura:</strong> ${temperature}°C</p>
            <p><strong>Umidade:</strong> ${humidity}%</p>
            <p><strong>Precipitação:</strong> ${precipitation}mm</p>
          </div>
        </div>
      `);
    }
  };

  const getColor = (feature: any) => {
    const temperature = feature.properties?.temperature || 0;
    if (temperature > 30) return '#ff4444';
    if (temperature > 25) return '#ffaa44';
    if (temperature > 20) return '#44ff44';
    return '#4444ff';
  };

  const style = (feature: any) => ({
    fillColor: getColor(feature),
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.7
  });

  return (
    <Layout title="Mapa Interativo">
      <div className="interactive-map-container">
        {/* Map Title */}
        <div className="map-title">
          <h2>Mapa Interativo</h2>
        </div>

        {/* Map Controls */}
        <div className="map-controls">
          <button className="control-button">
            <Layers size={20} />
            Camadas
          </button>
        </div>

        {/* Map Container */}
        <div className="map-wrapper">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Carregando mapa...</p>
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

      {/* Legend */}
      <div className="map-legend">
        <h3>Legenda de Temperatura</h3>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ff4444' }}></div>
            <span>Acima de 30°C</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ffaa44' }}></div>
            <span>25°C - 30°C</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#44ff44' }}></div>
            <span>20°C - 25°C</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#4444ff' }}></div>
            <span>Abaixo de 20°C</span>
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
};

export default InteractiveMap;
