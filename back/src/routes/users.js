const express = require('express');
const { Op, fn, col } = require('sequelize');
const User = require('../models/User');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', adminAuth, async (req, res) => {
  try {
    const { role, isActive, search, limit = 20, page = 1 } = req.query;

    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const lim = parseInt(limit, 10) || 20;
    const pg = parseInt(page, 10) || 1;

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      offset: (pg - 1) * lim,
      limit: lim
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        current: pg,
        total: Math.ceil(count / lim),
        count: rows.length,
        totalRecords: count
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuários'
    });
  }
});

router.get('/statistics', adminAuth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000);

    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { isActive: true } });
    const newUsers = await User.count({ where: { createdAt: { [Op.gte]: startDate } } });

    const byRoleRows = await User.findAll({
      attributes: ['role', [fn('COUNT', col('id')), 'count']],
      group: ['role'],
      raw: true
    });
    const byRole = {};
    for (const r of byRoleRows) {
      byRole[r.role] = parseInt(r.count, 10);
    }

    const topStates = await User.findAll({
      attributes: ['favoriteMunicipality', [fn('COUNT', col('id')), 'count']],
      where: { favoriteMunicipality: { [Op.ne]: null } },
      group: ['favoriteMunicipality'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 10,
      raw: true
    });

    res.json({
      success: true,
      data: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        newUsers,
        byRole,
        topStates: topStates.map((t) => ({ _id: t.favoriteMunicipality, count: parseInt(t.count, 10) })),
        period: {
          days: parseInt(days, 10),
          startDate,
          endDate: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas de usuários'
    });
  }
});

router.get('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário'
    });
  }
});

router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, email, phone, role, isActive, favoriteMunicipality, notificationPreference } = req.body;

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (favoriteMunicipality !== undefined) updateData.favoriteMunicipality = favoriteMunicipality;
    if (notificationPreference) updateData.notificationPreference = notificationPreference;

    await user.update(updateData);
    const fresh = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso',
      data: fresh
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar usuário'
    });
  }
});

router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível deletar seu próprio usuário'
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Usuário desativado com sucesso'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar usuário'
    });
  }
});

router.post('/:id/reset-password', adminAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha deve ter pelo menos 6 caracteres'
      });
    }

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Senha resetada com sucesso'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao resetar senha'
    });
  }
});

router.post('/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível desativar seu próprio usuário'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `Usuário ${user.isActive ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao alterar status do usuário'
    });
  }
});

module.exports = router;
