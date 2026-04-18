const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function loadUserFromToken(req, res) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token de acesso não fornecido'
    });
    return null;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
    return null;
  }

  const user = await User.findByPk(decoded.id, {
    attributes: { exclude: ['password'] }
  });

  if (!user || !user.isActive) {
    res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
    return null;
  }

  return user;
}

const auth = async (req, res, next) => {
  try {
    const user = await loadUserFromToken(req, res);
    if (!user) return;
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const user = await loadUserFromToken(req, res);
    if (!user) return;
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores.'
      });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro na verificação de admin'
    });
  }
};

module.exports = { auth, adminAuth };
