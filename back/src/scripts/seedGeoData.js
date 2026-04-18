/**
 * Geometrias de exemplo (polígonos simplificados). Para malhas oficiais, use fontes IBGE/GeoJSON próprios.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');
const GeoData = require('../models/GeoData');

// Dados geoespaciais do Brasil
const brazilGeoData = [
  // Regiões do Brasil
  {
    layerName: 'regioes_brasil',
    geometryType: 'Polygon',
    category: 'region',
    name: 'Norte',
    region: 'Norte',
    adminLevel: 1,
    properties: {
      codigo: '1',
      sigla: 'N',
      area: 3853327.0,
      populacao: 18881964
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-73.987235, -5.271786],
        [-60.0, -5.271786],
        [-60.0, 2.0],
        [-73.987235, 2.0],
        [-73.987235, -5.271786]
      ]]
    }
  },
  {
    layerName: 'regioes_brasil',
    geometryType: 'Polygon',
    category: 'region',
    name: 'Nordeste',
    region: 'Nordeste',
    adminLevel: 1,
    properties: {
      codigo: '2',
      sigla: 'NE',
      area: 1554160.0,
      populacao: 57317783
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-60.0, -18.0],
        [-35.0, -18.0],
        [-35.0, 2.0],
        [-60.0, 2.0],
        [-60.0, -18.0]
      ]]
    }
  },
  {
    layerName: 'regioes_brasil',
    geometryType: 'Polygon',
    category: 'region',
    name: 'Centro-Oeste',
    region: 'Centro-Oeste',
    adminLevel: 1,
    properties: {
      codigo: '3',
      sigla: 'CO',
      area: 1606371.0,
      populacao: 16367882
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-60.0, -25.0],
        [-45.0, -25.0],
        [-45.0, -5.0],
        [-60.0, -5.0],
        [-60.0, -25.0]
      ]]
    }
  },
  {
    layerName: 'regioes_brasil',
    geometryType: 'Polygon',
    category: 'region',
    name: 'Sudeste',
    region: 'Sudeste',
    adminLevel: 1,
    properties: {
      codigo: '4',
      sigla: 'SE',
      area: 924620.0,
      populacao: 88336514
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-45.0, -25.0],
        [-35.0, -25.0],
        [-35.0, -10.0],
        [-45.0, -10.0],
        [-45.0, -25.0]
      ]]
    }
  },
  {
    layerName: 'regioes_brasil',
    geometryType: 'Polygon',
    category: 'region',
    name: 'Sul',
    region: 'Sul',
    adminLevel: 1,
    properties: {
      codigo: '5',
      sigla: 'S',
      area: 576409.0,
      populacao: 29927004
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-60.0, -35.0],
        [-45.0, -35.0],
        [-45.0, -25.0],
        [-60.0, -25.0],
        [-60.0, -35.0]
      ]]
    }
  },
  // Estados principais
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'São Paulo',
    state: 'SP',
    region: 'Sudeste',
    adminLevel: 2,
    ibgeCode: '35',
    properties: {
      codigo: '35',
      sigla: 'SP',
      area: 248219.0,
      populacao: 46289333
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-53.0, -25.0],
        [-44.0, -25.0],
        [-44.0, -20.0],
        [-53.0, -20.0],
        [-53.0, -25.0]
      ]]
    }
  },
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'Minas Gerais',
    state: 'MG',
    region: 'Sudeste',
    adminLevel: 2,
    ibgeCode: '31',
    properties: {
      codigo: '31',
      sigla: 'MG',
      area: 586528.0,
      populacao: 21168791
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-51.0, -22.0],
        [-39.0, -22.0],
        [-39.0, -14.0],
        [-51.0, -14.0],
        [-51.0, -22.0]
      ]]
    }
  },
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'Rio de Janeiro',
    state: 'RJ',
    region: 'Sudeste',
    adminLevel: 2,
    ibgeCode: '33',
    properties: {
      codigo: '33',
      sigla: 'RJ',
      area: 43696.0,
      populacao: 17264943
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-45.0, -23.0],
        [-40.0, -23.0],
        [-40.0, -20.0],
        [-45.0, -20.0],
        [-45.0, -23.0]
      ]]
    }
  },
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'Bahia',
    state: 'BA',
    region: 'Nordeste',
    adminLevel: 2,
    ibgeCode: '29',
    properties: {
      codigo: '29',
      sigla: 'BA',
      area: 564733.0,
      populacao: 14873064
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-46.0, -18.0],
        [-37.0, -18.0],
        [-37.0, -8.0],
        [-46.0, -8.0],
        [-46.0, -18.0]
      ]]
    }
  },
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'Paraná',
    state: 'PR',
    region: 'Sul',
    adminLevel: 2,
    ibgeCode: '41',
    properties: {
      codigo: '41',
      sigla: 'PR',
      area: 199315.0,
      populacao: 11516840
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-54.0, -26.0],
        [-48.0, -26.0],
        [-48.0, -22.0],
        [-54.0, -22.0],
        [-54.0, -26.0]
      ]]
    }
  },
  {
    layerName: 'estados_brasil',
    geometryType: 'Polygon',
    category: 'state',
    name: 'Tocantins',
    state: 'TO',
    region: 'Norte',
    adminLevel: 2,
    ibgeCode: '17',
    properties: {
      codigo: '17',
      sigla: 'TO',
      area: 277621.0,
      populacao: 1607363
    },
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-50.5, -13.5],
        [-45.5, -13.5],
        [-45.5, -5.5],
        [-50.5, -5.5],
        [-50.5, -13.5]
      ]]
    }
  },
  // Tocantins — municípios com ingestão CPTEC (ClimaAgro nichado em TO)
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Palmas',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1721000',
    properties: {
      codigo: '1721000',
      nome: 'Palmas',
      uf: 'TO',
      cptecCityQuery: 'palmas',
      populacao: 302692
    },
    geom: { type: 'Point', coordinates: [-47.8103, -10.184] }
  },
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Araguaína',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1702109',
    properties: {
      codigo: '1702109',
      nome: 'Araguaína',
      uf: 'TO',
      cptecCityQuery: 'araguaina',
      populacao: 183381
    },
    geom: { type: 'Point', coordinates: [-48.2079, -7.1911] }
  },
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Gurupi',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1709500',
    properties: {
      codigo: '1709500',
      nome: 'Gurupi',
      uf: 'TO',
      cptecCityQuery: 'gurupi',
      populacao: 90647
    },
    geom: { type: 'Point', coordinates: [-49.0689, -11.7296] }
  },
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Porto Nacional',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1718204',
    properties: {
      codigo: '1718204',
      nome: 'Porto Nacional',
      uf: 'TO',
      cptecCityQuery: 'porto nacional',
      populacao: 53174
    },
    geom: { type: 'Point', coordinates: [-48.4169, -10.7081] }
  },
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Paraíso do Tocantins',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1716109',
    properties: {
      codigo: '1716109',
      nome: 'Paraíso do Tocantins',
      uf: 'TO',
      cptecCityQuery: 'paraiso do tocantins',
      populacao: 52959
    },
    geom: { type: 'Point', coordinates: [-48.8823, -10.1744] }
  },
  {
    layerName: 'municipios_tocantins',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Guaraí',
    state: 'TO',
    region: 'Norte',
    adminLevel: 3,
    ibgeCode: '1709302',
    properties: {
      codigo: '1709302',
      nome: 'Guaraí',
      uf: 'TO',
      cptecCityQuery: 'guarai',
      populacao: 25863
    },
    geom: { type: 'Point', coordinates: [-48.5106, -8.8354] }
  },
  // Municípios principais
  {
    layerName: 'municipios_brasil',
    geometryType: 'Point',
    category: 'municipality',
    name: 'São Paulo',
    state: 'SP',
    region: 'Sudeste',
    adminLevel: 3,
    ibgeCode: '3550308',
    properties: {
      codigo: '3550308',
      nome: 'São Paulo',
      uf: 'SP',
      area: 1521.0,
      populacao: 12396372
    },
    geom: {
      type: 'Point',
      coordinates: [-46.6333, -23.5505]
    }
  },
  {
    layerName: 'municipios_brasil',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Rio de Janeiro',
    state: 'RJ',
    region: 'Sudeste',
    adminLevel: 3,
    ibgeCode: '3304557',
    properties: {
      codigo: '3304557',
      nome: 'Rio de Janeiro',
      uf: 'RJ',
      area: 1200.0,
      populacao: 6775561
    },
    geom: {
      type: 'Point',
      coordinates: [-43.1729, -22.9068]
    }
  },
  {
    layerName: 'municipios_brasil',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Belo Horizonte',
    state: 'MG',
    region: 'Sudeste',
    adminLevel: 3,
    ibgeCode: '3106200',
    properties: {
      codigo: '3106200',
      nome: 'Belo Horizonte',
      uf: 'MG',
      area: 331.0,
      populacao: 2530701
    },
    geom: {
      type: 'Point',
      coordinates: [-43.9378, -19.9167]
    }
  },
  {
    layerName: 'municipios_brasil',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Salvador',
    state: 'BA',
    region: 'Nordeste',
    adminLevel: 3,
    ibgeCode: '2927408',
    properties: {
      codigo: '2927408',
      nome: 'Salvador',
      uf: 'BA',
      area: 693.0,
      populacao: 2886698
    },
    geom: {
      type: 'Point',
      coordinates: [-38.5108, -12.9714]
    }
  },
  {
    layerName: 'municipios_brasil',
    geometryType: 'Point',
    category: 'municipality',
    name: 'Curitiba',
    state: 'PR',
    region: 'Sul',
    adminLevel: 3,
    ibgeCode: '4106902',
    properties: {
      codigo: '4106902',
      nome: 'Curitiba',
      uf: 'PR',
      area: 435.0,
      populacao: 1963726
    },
    geom: {
      type: 'Point',
      coordinates: [-49.2733, -25.4281]
    }
  },
  // Estações meteorológicas simuladas
  {
    layerName: 'estacoes_meteorologicas',
    geometryType: 'Point',
    category: 'weather_station',
    name: 'Estação São Paulo - Centro',
    state: 'SP',
    region: 'Sudeste',
    adminLevel: 4,
    properties: {
      codigo: 'SP001',
      tipo: 'automatica',
      altitude: 760,
      operadora: 'INMET',
      ativa: true
    },
    geom: {
      type: 'Point',
      coordinates: [-46.6333, -23.5505]
    }
  },
  {
    layerName: 'estacoes_meteorologicas',
    geometryType: 'Point',
    category: 'weather_station',
    name: 'Estação Rio de Janeiro - Copacabana',
    state: 'RJ',
    region: 'Sudeste',
    adminLevel: 4,
    properties: {
      codigo: 'RJ001',
      tipo: 'automatica',
      altitude: 5,
      operadora: 'INMET',
      ativa: true
    },
    geom: {
      type: 'Point',
      coordinates: [-43.1729, -22.9068]
    }
  },
  {
    layerName: 'estacoes_meteorologicas',
    geometryType: 'Point',
    category: 'weather_station',
    name: 'Estação Belo Horizonte - Pampulha',
    state: 'MG',
    region: 'Sudeste',
    adminLevel: 4,
    properties: {
      codigo: 'MG001',
      tipo: 'automatica',
      altitude: 850,
      operadora: 'INMET',
      ativa: true
    },
    geom: {
      type: 'Point',
      coordinates: [-43.9378, -19.9167]
    }
  }
];

const seedGeoData = async () => {
  try {
    console.log('🌱 Iniciando seed dos dados geoespaciais...');
    
    // Limpar dados existentes
    await GeoData.destroy({ where: {} });
    console.log('🗑️  Dados existentes removidos');
    
    // Inserir novos dados
    for (const geoData of brazilGeoData) {
      await GeoData.create(geoData);
    }
    
    console.log(`✅ ${brazilGeoData.length} registros geoespaciais inseridos com sucesso!`);
    
    // Verificar dados inseridos
    const totalRegions = await GeoData.count({ where: { category: 'region' } });
    const totalStates = await GeoData.count({ where: { category: 'state' } });
    const totalMunicipalities = await GeoData.count({ where: { category: 'municipality' } });
    const totalStations = await GeoData.count({ where: { category: 'weather_station' } });
    
    console.log('📊 Resumo dos dados inseridos:');
    console.log(`   - Regiões: ${totalRegions}`);
    console.log(`   - Estados: ${totalStates}`);
    console.log(`   - Municípios: ${totalMunicipalities}`);
    console.log(`   - Estações Meteorológicas: ${totalStations}`);
    
  } catch (error) {
    console.error('❌ Erro ao inserir dados geoespaciais:', error);
    throw error;
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  seedGeoData()
    .then(() => {
      console.log('🎉 Seed concluído com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Erro no seed:', error);
      process.exit(1);
    });
}

module.exports = seedGeoData;
