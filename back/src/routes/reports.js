const express = require('express');
const Report = require('../models/Report');
const Weather = require('../models/Weather');
const Alert = require('../models/Alert');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/reports/generate
// @desc    Gerar novo relatório
// @access  Private
router.post('/generate', auth, async (req, res) => {
  try {
    const { 
      type, 
      title, 
      description, 
      location, 
      dateRange, 
      format = 'pdf',
      settings = {} 
    } = req.body;

    // Validar dados obrigatórios
    if (!type || !title || !location || !dateRange) {
      return res.status(400).json({
        success: false,
        message: 'Dados obrigatórios: type, title, location, dateRange'
      });
    }

    // Criar relatório
    const reportData = {
      user: req.user._id,
      type,
      title,
      description,
      settings: {
        location,
        dateRange,
        format,
        includeCharts: settings.includeCharts !== false,
        includeMaps: settings.includeMaps !== false,
        includeAlerts: settings.includeAlerts !== false,
        includeRecommendations: settings.includeRecommendations !== false
      }
    };

    const report = new Report(reportData);
    await report.save();

    // Iniciar processamento em background
    processReport(report._id);

    res.status(201).json({
      success: true,
      message: 'Relatório em processamento',
      data: {
        id: report._id,
        status: report.status,
        estimatedSize: report.calculateEstimatedSize(),
        filename: report.generateFilename()
      }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar relatório'
    });
  }
});

// @route   GET /api/reports
// @desc    Obter relatórios do usuário
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      type, 
      limit = 20, 
      page = 1 
    } = req.query;
    
    let query = { user: req.user._id };
    
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      data: reports,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: reports.length,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar relatórios'
    });
  }
});

// @route   GET /api/reports/:id
// @desc    Obter relatório específico
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Relatório não encontrado'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar relatório'
    });
  }
});

// @route   GET /api/reports/:id/download
// @desc    Download do relatório
// @access  Private
router.get('/:id/download', auth, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Relatório não encontrado'
      });
    }

    if (report.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Relatório ainda não está pronto para download'
      });
    }

    if (report.isExpired()) {
      return res.status(410).json({
        success: false,
        message: 'Relatório expirado'
      });
    }

    // Incrementar contador de downloads
    await report.incrementDownloadCount();

    // Incrementar contador do usuário
    await req.user.incrementExportedReports();

    res.json({
      success: true,
      data: {
        downloadUrl: report.file.downloadUrl,
        filename: report.file.originalName,
        size: report.file.size,
        mimeType: report.file.mimeType
      }
    });
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer download do relatório'
    });
  }
});

// @route   DELETE /api/reports/:id
// @desc    Deletar relatório
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Relatório não encontrado'
      });
    }

    await Report.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Relatório deletado com sucesso'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar relatório'
    });
  }
});

// @route   GET /api/reports/statistics
// @desc    Obter estatísticas de relatórios do usuário
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
    
    const reports = await Report.find({
      user: req.user._id,
      createdAt: { $gte: startDate }
    });

    const statistics = {
      total: reports.length,
      byType: {},
      byStatus: {},
      byFormat: {},
      totalDownloads: reports.reduce((sum, report) => sum + report.downloadCount, 0),
      totalSize: reports.reduce((sum, report) => sum + (report.file?.size || 0), 0),
      recent: reports.filter(report => 
        new Date(report.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };

    // Calcular estatísticas por categoria
    reports.forEach(report => {
      // Por tipo
      statistics.byType[report.type] = (statistics.byType[report.type] || 0) + 1;
      
      // Por status
      statistics.byStatus[report.status] = (statistics.byStatus[report.status] || 0) + 1;
      
      // Por formato
      statistics.byFormat[report.settings.format] = (statistics.byFormat[report.settings.format] || 0) + 1;
    });

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Get report statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas de relatórios'
    });
  }
});

// Função para processar relatório em background
async function processReport(reportId) {
  try {
    const report = await Report.findById(reportId);
    if (!report) return;

    // Marcar como processando
    await report.markAsProcessing();

    // Coletar dados climáticos
    const weatherData = await Weather.find({
      'location.state': report.settings.location.state,
      'location.name': new RegExp(report.settings.location.name, 'i'),
      dataTimestamp: {
        $gte: report.settings.dateRange.startDate,
        $lte: report.settings.dateRange.endDate
      }
    }).sort({ dataTimestamp: 1 });

    // Coletar alertas
    const alerts = await Alert.find({
      'location.state': report.settings.location.state,
      createdAt: {
        $gte: report.settings.dateRange.startDate,
        $lte: report.settings.dateRange.endDate
      }
    }).sort({ createdAt: -1 });

    // Processar dados
    const processedWeatherData = weatherData.map(data => ({
      date: data.dataTimestamp,
      temperature: {
        min: data.temperature.min || data.temperature.current,
        max: data.temperature.max || data.temperature.current,
        average: data.temperature.current
      },
      humidity: {
        min: data.humidity,
        max: data.humidity,
        average: data.humidity
      },
      precipitation: data.precipitation.current,
      wind: {
        speed: data.wind.speed,
        direction: data.wind.direction
      },
      pressure: data.pressure,
      condition: data.condition.main
    }));

    const processedAlerts = alerts.map(alert => ({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      date: alert.createdAt,
      description: alert.description
    }));

    // Gerar recomendações baseadas nos dados
    const recommendations = generateRecommendations(processedWeatherData, processedAlerts);

    // Atualizar relatório com dados coletados
    report.data = {
      weatherData: processedWeatherData,
      alerts: processedAlerts,
      recommendations
    };

    // Simular geração de arquivo (em produção, usar biblioteca de geração de PDF/Excel)
    const filename = report.generateFilename();
    const fileData = {
      filename: filename,
      originalName: filename,
      path: `/reports/${filename}`,
      size: report.calculateEstimatedSize(),
      mimeType: getMimeType(report.settings.format),
      downloadUrl: `/api/reports/${report._id}/file`
    };

    // Marcar como concluído
    await report.markAsCompleted(fileData);

    console.log(`Relatório ${reportId} processado com sucesso`);
  } catch (error) {
    console.error('Process report error:', error);
    const report = await Report.findById(reportId);
    if (report) {
      await report.markAsFailed(error.message);
    }
  }
}

// Função auxiliar para gerar recomendações
function generateRecommendations(weatherData, alerts) {
  const recommendations = [];
  
  // Análise de temperatura
  const avgTemp = weatherData.reduce((sum, data) => sum + data.temperature.average, 0) / weatherData.length;
  if (avgTemp > 30) {
    recommendations.push({
      category: 'agricultural',
      title: 'Temperatura Elevada',
      description: 'Temperaturas altas podem afetar o crescimento das plantas. Considere irrigação adicional.',
      priority: 'high',
      implementation: 'Aumentar frequência de irrigação e fornecer sombra se necessário.'
    });
  }

  // Análise de precipitação
  const totalPrecipitation = weatherData.reduce((sum, data) => sum + data.precipitation, 0);
  if (totalPrecipitation < 50) {
    recommendations.push({
      category: 'agricultural',
      title: 'Baixa Precipitação',
      description: 'Período de baixa precipitação detectado. Monitore a umidade do solo.',
      priority: 'medium',
      implementation: 'Implementar sistema de irrigação e monitorar umidade do solo.'
    });
  }

  // Análise de alertas
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  if (criticalAlerts.length > 0) {
    recommendations.push({
      category: 'safety',
      title: 'Alertas Críticos',
      description: `${criticalAlerts.length} alerta(s) crítico(s) detectado(s). Tome medidas de precaução.`,
      priority: 'critical',
      implementation: 'Seguir protocolos de segurança e evacuar se necessário.'
    });
  }

  return recommendations;
}

// Função auxiliar para obter MIME type
function getMimeType(format) {
  const mimeTypes = {
    'pdf': 'application/pdf',
    'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'csv': 'text/csv',
    'json': 'application/json'
  };
  return mimeTypes[format] || 'application/octet-stream';
}

module.exports = router;
