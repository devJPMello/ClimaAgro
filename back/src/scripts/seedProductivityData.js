const { models } = require('../config/database');
const { GeoData, Productivity, ClimateData } = models;

// Dados de exemplo para produtividade
const productivityData = [
  // Mato Grosso
  {
    geoDataId: null, // Será preenchido dinamicamente
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 3.2,
    plantedArea: 10500000,
    totalProduction: 33600000,
    historicalAverage: 3.0,
    variationFromAverage: 6.7,
    soilQualityIndex: 85,
    climateSuitabilityIndex: 78,
    technologyLevel: 'alta',
    irrigationUsed: false,
    fertilizerUsage: 120,
    pesticideUsage: 8.5,
    productionCostPerHectare: 2500,
    revenuePerHectare: 3200,
    profitPerHectare: 700,
    dataSource: 'conab',
    dataReliability: 95,
    status: 'confirmado'
  },
  // Paraná
  {
    geoDataId: null,
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 3.8,
    plantedArea: 5500000,
    totalProduction: 20900000,
    historicalAverage: 3.5,
    variationFromAverage: 8.6,
    soilQualityIndex: 92,
    climateSuitabilityIndex: 88,
    technologyLevel: 'precisao',
    irrigationUsed: true,
    fertilizerUsage: 150,
    pesticideUsage: 10.2,
    productionCostPerHectare: 2800,
    revenuePerHectare: 3800,
    profitPerHectare: 1000,
    dataSource: 'conab',
    dataReliability: 98,
    status: 'confirmado'
  },
  // Rio Grande do Sul
  {
    geoDataId: null,
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 3.5,
    plantedArea: 6200000,
    totalProduction: 21700000,
    historicalAverage: 3.2,
    variationFromAverage: 9.4,
    soilQualityIndex: 88,
    climateSuitabilityIndex: 82,
    technologyLevel: 'alta',
    irrigationUsed: false,
    fertilizerUsage: 135,
    pesticideUsage: 9.1,
    productionCostPerHectare: 2600,
    revenuePerHectare: 3500,
    profitPerHectare: 900,
    dataSource: 'conab',
    dataReliability: 96,
    status: 'confirmado'
  },
  // Goiás
  {
    geoDataId: null,
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 3.1,
    plantedArea: 3800000,
    totalProduction: 11780000,
    historicalAverage: 2.9,
    variationFromAverage: 6.9,
    soilQualityIndex: 82,
    climateSuitabilityIndex: 75,
    technologyLevel: 'media',
    irrigationUsed: false,
    fertilizerUsage: 110,
    pesticideUsage: 7.8,
    productionCostPerHectare: 2300,
    revenuePerHectare: 3100,
    profitPerHectare: 800,
    dataSource: 'conab',
    dataReliability: 92,
    status: 'confirmado'
  },
  // Bahia
  {
    geoDataId: null,
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 2.8,
    plantedArea: 1800000,
    totalProduction: 5040000,
    historicalAverage: 2.6,
    variationFromAverage: 7.7,
    soilQualityIndex: 75,
    climateSuitabilityIndex: 68,
    technologyLevel: 'media',
    irrigationUsed: true,
    fertilizerUsage: 95,
    pesticideUsage: 6.5,
    productionCostPerHectare: 2200,
    revenuePerHectare: 2800,
    profitPerHectare: 600,
    dataSource: 'conab',
    dataReliability: 88,
    status: 'confirmado'
  },
  // Maranhão
  {
    geoDataId: null,
    year: 2024,
    season: '2024/25',
    cropType: 'soja',
    productivity: 2.9,
    plantedArea: 2200000,
    totalProduction: 6380000,
    historicalAverage: 2.7,
    variationFromAverage: 7.4,
    soilQualityIndex: 78,
    climateSuitabilityIndex: 72,
    technologyLevel: 'media',
    irrigationUsed: false,
    fertilizerUsage: 100,
    pesticideUsage: 7.2,
    productionCostPerHectare: 2250,
    revenuePerHectare: 2900,
    profitPerHectare: 650,
    dataSource: 'conab',
    dataReliability: 90,
    status: 'confirmado'
  }
];

// Dados climáticos de exemplo
const climateData = [
  // Mato Grosso - 2024
  {
    geoDataId: null,
    date: '2024-01-15',
    year: 2024,
    month: 1,
    day: 15,
    avgTemperature: 28.5,
    maxTemperature: 35.2,
    minTemperature: 22.1,
    precipitation: 45.2,
    humidity: 68,
    windSpeed: 12.5,
    windDirection: 180,
    atmosphericPressure: 1013.2,
    solarRadiation: 22.1,
    evapotranspiration: 4.8,
    waterStressIndex: 25,
    climateSuitabilityIndex: 78,
    consecutiveDryDays: 3,
    rainyDays: 8,
    monthlyPrecipitation: 180.5,
    monthlyAvgTemperature: 28.2,
    dataSource: 'inmet',
    weatherStation: 'Cuiabá',
    stationCode: 'A001',
    dataQuality: 95,
    status: 'confirmado'
  },
  // Paraná - 2024
  {
    geoDataId: null,
    date: '2024-01-15',
    year: 2024,
    month: 1,
    day: 15,
    avgTemperature: 24.8,
    maxTemperature: 30.5,
    minTemperature: 19.2,
    precipitation: 52.8,
    humidity: 82,
    windSpeed: 8.5,
    windDirection: 220,
    atmosphericPressure: 1015.8,
    solarRadiation: 18.9,
    evapotranspiration: 3.2,
    waterStressIndex: 15,
    climateSuitabilityIndex: 88,
    consecutiveDryDays: 1,
    rainyDays: 12,
    monthlyPrecipitation: 220.3,
    monthlyAvgTemperature: 24.5,
    dataSource: 'inmet',
    weatherStation: 'Curitiba',
    stationCode: 'A002',
    dataQuality: 98,
    status: 'confirmado'
  }
];

const seedProductivityData = async () => {
  try {
    console.log('🌱 Iniciando seed de dados de produtividade...');

    // Buscar dados geográficos existentes
    const geoData = await GeoData.findAll({
      where: { isActive: true }
    });

    if (geoData.length === 0) {
      console.log('❌ Nenhum dado geográfico encontrado. Execute primeiro o seed de dados geográficos.');
      return;
    }

    // Mapear estados para dados de produtividade
    const stateMapping = {
      'MT': 0, // Mato Grosso
      'PR': 1, // Paraná
      'RS': 2, // Rio Grande do Sul
      'GO': 3, // Goiás
      'BA': 4, // Bahia
      'MA': 5  // Maranhão
    };

    // Criar dados de produtividade
    for (const [stateCode, dataIndex] of Object.entries(stateMapping)) {
      const geoDataItem = geoData.find(g => g.state === stateCode);
      if (geoDataItem) {
        const productivityItem = { ...productivityData[dataIndex] };
        productivityItem.geoDataId = geoDataItem.id;

        // Verificar se já existe
        const existing = await Productivity.findOne({
          where: {
            geoDataId: geoDataItem.id,
            year: productivityItem.year,
            cropType: productivityItem.cropType
          }
        });

        if (!existing) {
          await Productivity.create(productivityItem);
          console.log(`✅ Dados de produtividade criados para ${geoDataItem.name} (${stateCode})`);
        } else {
          console.log(`⚠️  Dados de produtividade já existem para ${geoDataItem.name} (${stateCode})`);
        }
      }
    }

    // Criar dados climáticos
    for (let i = 0; i < geoData.length && i < climateData.length; i++) {
      const geoDataItem = geoData[i];
      const climateItem = { ...climateData[i] };
      climateItem.geoDataId = geoDataItem.id;

      // Verificar se já existe
      const existing = await ClimateData.findOne({
        where: {
          geoDataId: geoDataItem.id,
          date: climateItem.date
        }
      });

      if (!existing) {
        await ClimateData.create(climateItem);
        console.log(`✅ Dados climáticos criados para ${geoDataItem.name}`);
      } else {
        console.log(`⚠️  Dados climáticos já existem para ${geoDataItem.name}`);
      }
    }

    // Criar dados históricos (anos anteriores)
    const years = [2020, 2021, 2022, 2023];
    for (const year of years) {
      for (const [stateCode, dataIndex] of Object.entries(stateMapping)) {
        const geoDataItem = geoData.find(g => g.state === stateCode);
        if (geoDataItem) {
          const baseData = productivityData[dataIndex];
          const historicalData = {
            ...baseData,
            geoDataId: geoDataItem.id,
            year: year,
            season: `${year}/${year + 1}`,
            productivity: baseData.productivity + (Math.random() - 0.5) * 0.4, // Variação aleatória
            plantedArea: baseData.plantedArea * (0.9 + Math.random() * 0.2), // Variação de área
            historicalAverage: null, // Será calculado depois
            variationFromAverage: null,
            dataReliability: 85 + Math.random() * 10
          };

          // Calcular produção total
          historicalData.totalProduction = historicalData.productivity * historicalData.plantedArea;

          // Verificar se já existe
          const existing = await Productivity.findOne({
            where: {
              geoDataId: geoDataItem.id,
              year: year,
              cropType: historicalData.cropType
            }
          });

          if (!existing) {
            await Productivity.create(historicalData);
            console.log(`✅ Dados históricos criados para ${geoDataItem.name} - ${year}`);
          }
        }
      }
    }

    // Calcular médias históricas e variações
    console.log('📊 Calculando médias históricas...');
    for (const [stateCode, dataIndex] of Object.entries(stateMapping)) {
      const geoDataItem = geoData.find(g => g.state === stateCode);
      if (geoDataItem) {
        await Productivity.calculateHistoricalVariation(
          geoDataItem.id,
          'soja',
          2024
        );
        console.log(`✅ Médias históricas calculadas para ${geoDataItem.name}`);
      }
    }

    console.log('🎉 Seed de dados de produtividade concluído com sucesso!');
    
    // Estatísticas finais
    const totalProductivity = await Productivity.count();
    const totalClimate = await ClimateData.count();
    
    console.log(`📈 Total de registros de produtividade: ${totalProductivity}`);
    console.log(`🌤️  Total de registros climáticos: ${totalClimate}`);

  } catch (error) {
    console.error('❌ Erro ao executar seed de produtividade:', error);
    throw error;
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  seedProductivityData()
    .then(() => {
      console.log('✅ Script executado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na execução:', error);
      process.exit(1);
    });
}

module.exports = seedProductivityData;
