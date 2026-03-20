const express = require('express');
const router = express.Router();
const { supersetClient } = require('../config/superset');

// GET /api/superset/dashboards - Listar dashboards
router.get('/dashboards', async (req, res) => {
  try {
    const dashboards = await supersetClient.listDashboards();
    
    res.json({
      success: true,
      data: dashboards
    });
  } catch (error) {
    console.error('Erro ao listar dashboards:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/superset/setup - Configurar integração
router.post('/setup', async (req, res) => {
  try {
    const result = await supersetClient.setupIntegration();
    
    res.json({
      success: true,
      data: result,
      message: 'Integração com Superset configurada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao configurar Superset:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao configurar integração com Superset',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/superset/status - Verificar status da conexão
router.get('/status', async (req, res) => {
  try {
    const authenticated = await supersetClient.ensureAuthenticated();
    
    res.json({
      success: true,
      data: {
        connected: authenticated,
        baseUrl: supersetClient.SUPERSET_CONFIG?.baseUrl || 'Não configurado'
      }
    });
  } catch (error) {
    console.error('Erro ao verificar status do Superset:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao verificar conexão com Superset',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
