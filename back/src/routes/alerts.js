const express = require('express');
const Alert = require('../models/Alert');
const { auth, adminAuth } = require('../middleware/auth');
const { validateAlert } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/alerts
// @desc    Obter alertas ativos
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { 
      type, 
      severity, 
      state, 
      status = 'active',
      limit = 50,
      page = 1 
    } = req.query;
    
    let query = {};
    
    // Filtrar por tipo
    if (type) {
      query.type = type;
    }
    
    // Filtrar por severidade
    if (severity) {
      query.severity = severity;
    }
    
    // Filtrar por estado
    if (state) {
      query['location.state'] = state.toUpperCase();
    }
    
    // Filtrar por status
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);

    res.json({
      success: true,
      data: alerts,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: alerts.length,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alertas'
    });
  }
});

// @route   GET /api/alerts/active
// @desc    Obter apenas alertas ativos
// @access  Private
router.get('/active', auth, async (req, res) => {
  try {
    const { state, type, severity } = req.query;
    
    let query = {
      status: 'active',
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    };
    
    if (state) query['location.state'] = state.toUpperCase();
    if (type) query.type = type;
    if (severity) query.severity = severity;

    const alerts = await Alert.find(query)
      .sort({ severity: 1, createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Get active alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alertas ativos'
    });
  }
});

// @route   GET /api/alerts/:id
// @desc    Obter alerta específico
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alerta'
    });
  }
});

// @route   POST /api/alerts
// @desc    Criar novo alerta
// @access  Private (Admin)
router.post('/', adminAuth, validateAlert, async (req, res) => {
  try {
    const alertData = {
      ...req.body,
      createdBy: req.user._id
    };

    const alert = new Alert(alertData);
    await alert.save();

    res.status(201).json({
      success: true,
      message: 'Alerta criado com sucesso',
      data: alert
    });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar alerta'
    });
  }
});

// @route   PUT /api/alerts/:id
// @desc    Atualizar alerta
// @access  Private (Admin)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }

    const updatedAlert = await Alert.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Alerta atualizado com sucesso',
      data: updatedAlert
    });
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar alerta'
    });
  }
});

// @route   DELETE /api/alerts/:id
// @desc    Deletar alerta
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }

    await Alert.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Alerta deletado com sucesso'
    });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar alerta'
    });
  }
});

// @route   POST /api/alerts/:id/acknowledge
// @desc    Marcar alerta como reconhecido pelo usuário
// @access  Private
router.post('/:id/acknowledge', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }

    // Verificar se o usuário já foi notificado sobre este alerta
    const notification = alert.notifiedUsers.find(
      n => n.user.toString() === req.user._id.toString()
    );

    if (notification) {
      notification.acknowledged = true;
      notification.acknowledgedAt = new Date();
      await alert.save();
    } else {
      // Adicionar usuário como notificado e reconhecido
      alert.notifiedUsers.push({
        user: req.user._id,
        notificationMethod: 'manual',
        acknowledged: true,
        acknowledgedAt: new Date()
      });
      await alert.save();
    }

    res.json({
      success: true,
      message: 'Alerta reconhecido com sucesso'
    });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao reconhecer alerta'
    });
  }
});

// @route   GET /api/alerts/statistics
// @desc    Obter estatísticas de alertas
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const { state, days = 30 } = req.query;
    
    let query = {
      createdAt: { 
        $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) 
      }
    };
    
    if (state) query['location.state'] = state.toUpperCase();

    const alerts = await Alert.find(query);

    const statistics = {
      total: alerts.length,
      byType: {},
      bySeverity: {},
      byStatus: {},
      byState: {},
      recent: alerts.filter(alert => 
        new Date(alert.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };

    // Calcular estatísticas por categoria
    alerts.forEach(alert => {
      // Por tipo
      statistics.byType[alert.type] = (statistics.byType[alert.type] || 0) + 1;
      
      // Por severidade
      statistics.bySeverity[alert.severity] = (statistics.bySeverity[alert.severity] || 0) + 1;
      
      // Por status
      statistics.byStatus[alert.status] = (statistics.byStatus[alert.status] || 0) + 1;
      
      // Por estado
      const state = alert.location.state;
      statistics.byState[state] = (statistics.byState[state] || 0) + 1;
    });

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Get alert statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas de alertas'
    });
  }
});

// @route   POST /api/alerts/cleanup
// @desc    Limpar alertas expirados
// @access  Private (Admin)
router.post('/cleanup', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    
    // Marcar alertas expirados como expirados
    const expiredAlerts = await Alert.updateMany(
      {
        status: 'active',
        validUntil: { $lt: now }
      },
      {
        $set: { status: 'expired' }
      }
    );

    res.json({
      success: true,
      message: `${expiredAlerts.modifiedCount} alertas expirados foram atualizados`,
      data: {
        updatedCount: expiredAlerts.modifiedCount
      }
    });
  } catch (error) {
    console.error('Cleanup alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar alertas expirados'
    });
  }
});

module.exports = router;
