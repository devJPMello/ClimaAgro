const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Tipo de alerta é obrigatório'],
    enum: {
      values: ['temperature', 'precipitation', 'wind', 'storm', 'drought', 'flood', 'frost'],
      message: 'Tipo de alerta inválido'
    }
  },
  severity: {
    type: String,
    required: [true, 'Severidade é obrigatória'],
    enum: {
      values: ['low', 'medium', 'high', 'critical'],
      message: 'Severidade inválida'
    }
  },
  title: {
    type: String,
    required: [true, 'Título é obrigatório'],
    trim: true,
    maxlength: [100, 'Título não pode ter mais de 100 caracteres']
  },
  description: {
    type: String,
    required: [true, 'Descrição é obrigatória'],
    trim: true,
    maxlength: [500, 'Descrição não pode ter mais de 500 caracteres']
  },
  location: {
    name: {
      type: String,
      required: [true, 'Nome da localização é obrigatório'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'Estado é obrigatório'],
      trim: true,
      uppercase: true
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Latitude é obrigatória'],
        min: [-90, 'Latitude inválida'],
        max: [90, 'Latitude inválida']
      },
      longitude: {
        type: Number,
        required: [true, 'Longitude é obrigatória'],
        min: [-180, 'Longitude inválida'],
        max: [180, 'Longitude inválida']
      }
    }
  },
  // Dados específicos do alerta
  alertData: {
    temperature: {
      current: Number,
      threshold: Number,
      unit: {
        type: String,
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      }
    },
    precipitation: {
      current: Number,
      threshold: Number,
      unit: {
        type: String,
        enum: ['mm', 'inches'],
        default: 'mm'
      }
    },
    wind: {
      speed: Number,
      direction: Number,
      unit: {
        type: String,
        enum: ['kmh', 'mph', 'ms'],
        default: 'kmh'
      }
    },
    duration: {
      type: Number, // em horas
      min: [0, 'Duração não pode ser negativa']
    },
    probability: {
      type: Number, // probabilidade de ocorrência (0-100)
      min: [0, 'Probabilidade não pode ser negativa'],
      max: [100, 'Probabilidade não pode ser maior que 100%']
    }
  },
  // Status do alerta
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'resolved'],
    default: 'active'
  },
  // Datas importantes
  validFrom: {
    type: Date,
    required: [true, 'Data de início é obrigatória'],
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: [true, 'Data de fim é obrigatória']
  },
  // Recomendações
  recommendations: [{
    type: {
      type: String,
      enum: ['agricultural', 'safety', 'preparation', 'evacuation'],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  }],
  // Usuários notificados
  notifiedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notificationMethod: {
      type: String,
      enum: ['email', 'sms', 'push'],
      required: true
    },
    notifiedAt: {
      type: Date,
      default: Date.now
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date
  }],
  // Metadados
  source: {
    type: String,
    enum: ['api', 'manual', 'system', 'user'],
    default: 'system'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Tags para categorização
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  // Dados de impacto
  impact: {
    agricultural: {
      type: String,
      enum: ['none', 'low', 'moderate', 'high', 'severe']
    },
    economic: {
      type: String,
      enum: ['none', 'low', 'moderate', 'high', 'severe']
    },
    safety: {
      type: String,
      enum: ['none', 'low', 'moderate', 'high', 'severe']
    }
  }
}, {
  timestamps: true
});

// Índices para performance
alertSchema.index({ type: 1, severity: 1 });
alertSchema.index({ status: 1, validFrom: 1, validUntil: 1 });
alertSchema.index({ 'location.state': 1, status: 1 });
alertSchema.index({ 'location.coordinates': '2dsphere' });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ tags: 1 });

// Índice composto para consultas eficientes
alertSchema.index({ 
  status: 1, 
  type: 1, 
  severity: 1, 
  validFrom: 1, 
  validUntil: 1 
});

// Middleware para validar datas
alertSchema.pre('save', function(next) {
  if (this.validUntil <= this.validFrom) {
    return next(new Error('Data de fim deve ser posterior à data de início'));
  }
  next();
});

// Método para verificar se o alerta está ativo
alertSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && 
         this.validFrom <= now && 
         this.validUntil >= now;
};

// Método para verificar se o alerta expirou
alertSchema.methods.isExpired = function() {
  const now = new Date();
  return this.validUntil < now;
};

// Método para calcular prioridade baseada na severidade e impacto
alertSchema.methods.calculatePriority = function() {
  const severityWeight = {
    'low': 1,
    'medium': 2,
    'high': 3,
    'critical': 4
  };
  
  const impactWeight = {
    'none': 0,
    'low': 1,
    'moderate': 2,
    'high': 3,
    'severe': 4
  };
  
  const severity = severityWeight[this.severity] || 0;
  const agriculturalImpact = impactWeight[this.impact?.agricultural] || 0;
  const safetyImpact = impactWeight[this.impact?.safety] || 0;
  
  const totalWeight = severity + agriculturalImpact + safetyImpact;
  
  if (totalWeight >= 8) return 'critical';
  if (totalWeight >= 6) return 'high';
  if (totalWeight >= 4) return 'medium';
  return 'low';
};

// Método para adicionar usuário notificado
alertSchema.methods.addNotifiedUser = function(userId, notificationMethod) {
  const existingNotification = this.notifiedUsers.find(
    n => n.user.toString() === userId.toString() && n.notificationMethod === notificationMethod
  );
  
  if (!existingNotification) {
    this.notifiedUsers.push({
      user: userId,
      notificationMethod,
      notifiedAt: new Date()
    });
  }
  
  return this.save();
};

module.exports = mongoose.model('Alert', alertSchema);
