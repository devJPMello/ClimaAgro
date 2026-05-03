const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validation');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

router.post('/register', validateRegister, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      favoriteMunicipality,
      profileType = 'standard',
      creaRegistrationNumber,
      creaUf,
      cpf,
      creaDocumentStorageKey
    } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já existe com este email'
      });
    }

    const isAgronomist = profileType === 'agronomist';

    const user = await User.create({
      name,
      email,
      password,
      phone: phone || null,
      favoriteMunicipality,
      role: isAgronomist ? 'agronomist' : 'user',
      agronomistApprovalStatus: isAgronomist ? 'pending' : null,
      creaRegistrationNumber: isAgronomist ? creaRegistrationNumber : null,
      creaUf: isAgronomist && creaUf ? String(creaUf).trim().toUpperCase() : null,
      cpf: isAgronomist ? cpf : null,
      creaDocumentStorageKey: isAgronomist ? creaDocumentStorageKey : null
    });

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: isAgronomist
        ? 'Cadastro recebido. Seu perfil de agrônomo está aguardando aprovação.'
        : 'Usuário criado com sucesso',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          favoriteMunicipality: user.favoriteMunicipality,
          registrationDate: user.createdAt,
          agronomistApprovalStatus: user.agronomistApprovalStatus,
          creaUf: user.creaUf,
          creaRegistrationNumber: user.creaRegistrationNumber
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o suporte.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    await user.updateLastAccess();

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          favoriteMunicipality: user.favoriteMunicipality,
          lastAccess: user.lastAccess,
          exportedReports: user.exportedReports,
          agronomistApprovalStatus: user.agronomistApprovalStatus
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          phone: req.user.phone,
          role: req.user.role,
          favoriteMunicipality: req.user.favoriteMunicipality,
          notificationPreference: req.user.notificationPreference,
          lastAccess: req.user.lastAccess,
          registrationDate: req.user.createdAt,
          exportedReports: req.user.exportedReports,
          agronomistApprovalStatus: req.user.agronomistApprovalStatus
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, favoriteMunicipality, notificationPreference } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (favoriteMunicipality) updateData.favoriteMunicipality = favoriteMunicipality;
    if (notificationPreference) updateData.notificationPreference = notificationPreference;

    const user = await User.findByPk(req.user.id);
    await user.update(updateData);

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          favoriteMunicipality: user.favoriteMunicipality,
          notificationPreference: user.notificationPreference,
          lastAccess: user.lastAccess,
          registrationDate: user.createdAt,
          exportedReports: user.exportedReports
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual e nova senha são obrigatórias'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha deve ter pelo menos 6 caracteres'
      });
    }

    const user = await User.findByPk(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual incorreta'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Senha é obrigatória para deletar a conta'
      });
    }

    const user = await User.findByPk(req.user.id);
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Senha incorreta'
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Conta desativada com sucesso'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
