const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errors.array()
    });
  }
  next();
};

// Validações para autenticação
const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Nome deve ter entre 2 e 120 caracteres'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('phone')
    .if((value, { req }) => req.body.profileType === 'agronomist')
    .trim()
    .notEmpty()
    .withMessage('Telefone é obrigatório para agrônomos')
    .isMobilePhone('pt-BR')
    .withMessage('Telefone inválido'),
  body('phone')
    .if((value, { req }) => req.body.profileType !== 'agronomist')
    .optional({ values: 'falsy' })
    .isMobilePhone('pt-BR')
    .withMessage('Telefone inválido'),
  body('profileType')
    .optional()
    .isIn(['standard', 'agronomist'])
    .withMessage('Tipo de perfil inválido'),
  body('creaRegistrationNumber')
    .if(body('profileType').equals('agronomist'))
    .trim()
    .notEmpty()
    .withMessage('Número do registro CREA é obrigatório'),
  body('creaUf')
    .if(body('profileType').equals('agronomist'))
    .trim()
    .isLength({ min: 2, max: 2 })
    .matches(/^[A-Z]{2}$/i)
    .withMessage('UF do CREA inválida'),
  body('cpf')
    .if(body('profileType').equals('agronomist'))
    .matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
    .withMessage('CPF inválido'),
  body('creaDocumentStorageKey')
    .if(body('profileType').equals('agronomist'))
    .trim()
    .matches(/^crea-documents\/[a-zA-Z0-9_.\-]+$/)
    .withMessage('Identificador do documento CREA inválido'),
  handleValidationErrors
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória'),
  handleValidationErrors
];

// Validações para dados climáticos
const validateWeatherData = [
  body('location')
    .notEmpty()
    .withMessage('Localização é obrigatória'),
  body('temperature')
    .isNumeric()
    .withMessage('Temperatura deve ser um número'),
  body('humidity')
    .isNumeric()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Umidade deve ser entre 0 e 100'),
  body('precipitation')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Precipitação deve ser um número positivo'),
  handleValidationErrors
];

// Validações para alertas
const validateAlert = [
  body('type')
    .isIn(['temperature', 'precipitation', 'wind', 'storm'])
    .withMessage('Tipo de alerta inválido'),
  body('severity')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Severidade inválida'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Título deve ter entre 5 e 100 caracteres'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Descrição deve ter entre 10 e 500 caracteres'),
  body('location')
    .notEmpty()
    .withMessage('Localização é obrigatória'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateWeatherData,
  validateAlert
};
