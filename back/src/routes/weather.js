const express = require('express');
const Weather = require('../models/Weather');
const { auth } = require('../middleware/auth');
const { validateWeatherData } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/weather/current
// @desc    Obter dados climáticos atuais
// @access  Private
router.get('/current', auth, async (req, res) => {
  try {
    const { state, city, lat, lng } = req.query;
    
    let query = {};
    
    // Filtrar por estado
    if (state) {
      query['location.state'] = state.toUpperCase();
    }
    
    // Filtrar por cidade
    if (city) {
      query['location.name'] = new RegExp(city, 'i');
    }
    
    // Filtrar por coordenadas (busca por proximidade)
    if (lat && lng) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: 50000 // 50km de raio
        }
      };
    }

    const weatherData = await Weather.find(query)
      .sort({ dataTimestamp: -1 })
      .limit(50);

    // Filtrar apenas dados válidos
    const validData = weatherData.filter(data => data.isDataValid());

    res.json({
      success: true,
      data: validData,
      count: validData.length
    });
  } catch (error) {
    console.error('Get current weather error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados climáticos'
    });
  }
});

// @route   GET /api/weather/history
// @desc    Obter histórico de dados climáticos
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const { 
      state, 
      city, 
      startDate, 
      endDate, 
      limit = 100,
      page = 1 
    } = req.query;
    
    let query = {};
    
    // Filtrar por estado
    if (state) {
      query['location.state'] = state.toUpperCase();
    }
    
    // Filtrar por cidade
    if (city) {
      query['location.name'] = new RegExp(city, 'i');
    }
    
    // Filtrar por período
    if (startDate || endDate) {
      query.dataTimestamp = {};
      if (startDate) query.dataTimestamp.$gte = new Date(startDate);
      if (endDate) query.dataTimestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const weatherData = await Weather.find(query)
      .sort({ dataTimestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Weather.countDocuments(query);

    res.json({
      success: true,
      data: weatherData,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: weatherData.length,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('Get weather history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico climático'
    });
  }
});

// @route   GET /api/weather/states
// @desc    Obter lista de estados com dados climáticos
// @access  Private
router.get('/states', auth, async (req, res) => {
  try {
    const states = await Weather.distinct('location.state', {
      dataTimestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Últimas 24h
    });

    const statesWithData = await Promise.all(
      states.map(async (state) => {
        const latestData = await Weather.findOne({ 'location.state': state })
          .sort({ dataTimestamp: -1 });
        
        return {
          state,
          name: getStateName(state),
          latestUpdate: latestData?.dataTimestamp,
          temperature: latestData?.temperature?.current,
          condition: latestData?.condition?.main
        };
      })
    );

    res.json({
      success: true,
      data: statesWithData
    });
  } catch (error) {
    console.error('Get states error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estados'
    });
  }
});

// @route   GET /api/weather/cities/:state
// @desc    Obter lista de cidades de um estado
// @access  Private
router.get('/cities/:state', auth, async (req, res) => {
  try {
    const { state } = req.params;
    
    const cities = await Weather.distinct('location.name', {
      'location.state': state.toUpperCase(),
      dataTimestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Últimos 7 dias
    });

    const citiesWithData = await Promise.all(
      cities.map(async (city) => {
        const latestData = await Weather.findOne({ 
          'location.state': state.toUpperCase(),
          'location.name': city 
        }).sort({ dataTimestamp: -1 });
        
        return {
          name: city,
          coordinates: latestData?.location?.coordinates,
          latestUpdate: latestData?.dataTimestamp,
          temperature: latestData?.temperature?.current,
          condition: latestData?.condition?.main
        };
      })
    );

    res.json({
      success: true,
      data: citiesWithData
    });
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar cidades'
    });
  }
});

// @route   POST /api/weather
// @desc    Adicionar dados climáticos (admin)
// @access  Private (Admin)
router.post('/', auth, validateWeatherData, async (req, res) => {
  try {
    // Verificar se é admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores.'
      });
    }

    const weatherData = new Weather(req.body);
    await weatherData.save();

    res.status(201).json({
      success: true,
      message: 'Dados climáticos adicionados com sucesso',
      data: weatherData
    });
  } catch (error) {
    console.error('Add weather data error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar dados climáticos'
    });
  }
});

// @route   GET /api/weather/statistics
// @desc    Obter estatísticas climáticas
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const { state, city, days = 30 } = req.query;
    
    let query = {
      dataTimestamp: { 
        $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) 
      }
    };
    
    if (state) query['location.state'] = state.toUpperCase();
    if (city) query['location.name'] = new RegExp(city, 'i');

    const weatherData = await Weather.find(query).sort({ dataTimestamp: 1 });

    if (weatherData.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'Nenhum dado encontrado para o período especificado'
        }
      });
    }

    // Calcular estatísticas
    const temperatures = weatherData.map(d => d.temperature.current);
    const humidities = weatherData.map(d => d.humidity);
    const precipitations = weatherData.map(d => d.precipitation.current);

    const statistics = {
      temperature: {
        average: Math.round(temperatures.reduce((a, b) => a + b, 0) / temperatures.length),
        min: Math.min(...temperatures),
        max: Math.max(...temperatures),
        trend: calculateTrend(temperatures)
      },
      humidity: {
        average: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
        min: Math.min(...humidities),
        max: Math.max(...humidities)
      },
      precipitation: {
        total: precipitations.reduce((a, b) => a + b, 0),
        average: Math.round(precipitations.reduce((a, b) => a + b, 0) / precipitations.length),
        max: Math.max(...precipitations)
      },
      period: {
        startDate: weatherData[0].dataTimestamp,
        endDate: weatherData[weatherData.length - 1].dataTimestamp,
        days: parseInt(days),
        records: weatherData.length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Get weather statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas climáticas'
    });
  }
});

// Função auxiliar para obter nome do estado
function getStateName(stateCode) {
  const states = {
    'AC': 'Acre',
    'AL': 'Alagoas',
    'AP': 'Amapá',
    'AM': 'Amazonas',
    'BA': 'Bahia',
    'CE': 'Ceará',
    'DF': 'Distrito Federal',
    'ES': 'Espírito Santo',
    'GO': 'Goiás',
    'MA': 'Maranhão',
    'MT': 'Mato Grosso',
    'MS': 'Mato Grosso do Sul',
    'MG': 'Minas Gerais',
    'PA': 'Pará',
    'PB': 'Paraíba',
    'PR': 'Paraná',
    'PE': 'Pernambuco',
    'PI': 'Piauí',
    'RJ': 'Rio de Janeiro',
    'RN': 'Rio Grande do Norte',
    'RS': 'Rio Grande do Sul',
    'RO': 'Rondônia',
    'RR': 'Roraima',
    'SC': 'Santa Catarina',
    'SP': 'São Paulo',
    'SE': 'Sergipe',
    'TO': 'Tocantins'
  };
  return states[stateCode] || stateCode;
}

// Função auxiliar para calcular tendência
function calculateTrend(values) {
  if (values.length < 2) return 'stable';
  
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const difference = secondAvg - firstAvg;
  
  if (Math.abs(difference) < 1) return 'stable';
  return difference > 0 ? 'increasing' : 'decreasing';
}

module.exports = router;
