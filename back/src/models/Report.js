const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório']
  },
  type: {
    type: String,
    required: [true, 'Tipo de relatório é obrigatório'],
    enum: {
      values: ['climate', 'productivity', 'alerts', 'complete', 'custom'],
      message: 'Tipo de relatório inválido'
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
    trim: true,
    maxlength: [500, 'Descrição não pode ter mais de 500 caracteres']
  },
  // Configurações do relatório
  settings: {
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
        latitude: Number,
        longitude: Number
      }
    },
    dateRange: {
      startDate: {
        type: Date,
        required: [true, 'Data de início é obrigatória']
      },
      endDate: {
        type: Date,
        required: [true, 'Data de fim é obrigatória']
      }
    },
    format: {
      type: String,
      enum: ['pdf', 'excel', 'csv', 'json'],
      default: 'pdf'
    },
    includeCharts: {
      type: Boolean,
      default: true
    },
    includeMaps: {
      type: Boolean,
      default: true
    },
    includeAlerts: {
      type: Boolean,
      default: true
    },
    includeRecommendations: {
      type: Boolean,
      default: true
    }
  },
  // Dados do relatório
  data: {
    weatherData: [{
      date: Date,
      temperature: {
        min: Number,
        max: Number,
        average: Number
      },
      humidity: {
        min: Number,
        max: Number,
        average: Number
      },
      precipitation: Number,
      wind: {
        speed: Number,
        direction: Number
      },
      pressure: Number,
      condition: String
    }],
    alerts: [{
      type: String,
      severity: String,
      title: String,
      date: Date,
      description: String
    }],
    agriculturalData: {
      soilMoisture: [{
        date: Date,
        value: Number
      }],
      cropGrowth: [{
        date: Date,
        stage: String,
        health: String
      }],
      productivity: {
        expected: Number,
        actual: Number,
        unit: String
      }
    },
    recommendations: [{
      category: String,
      title: String,
      description: String,
      priority: String,
      implementation: String
    }]
  },
  // Status do relatório
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  // Arquivo gerado
  file: {
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    downloadUrl: String
  },
  // Metadados
  generatedAt: Date,
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
    }
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: Date,
  // Configurações de processamento
  processingOptions: {
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal'
    },
    retryCount: {
      type: Number,
      default: 0,
      max: 3
    },
    errorMessage: String
  }
}, {
  timestamps: true
});

// Índices para performance
reportSchema.index({ user: 1, createdAt: -1 });
reportSchema.index({ type: 1, status: 1 });
reportSchema.index({ 'settings.location.state': 1 });
reportSchema.index({ 'settings.dateRange.startDate': 1, 'settings.dateRange.endDate': 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ expiresAt: 1 });

// Middleware para validar datas
reportSchema.pre('save', function(next) {
  if (this.settings.dateRange.endDate <= this.settings.dateRange.startDate) {
    return next(new Error('Data de fim deve ser posterior à data de início'));
  }
  next();
});

// Método para verificar se o relatório expirou
reportSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Método para incrementar contador de downloads
reportSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  return this.save();
};

// Método para marcar como processando
reportSchema.methods.markAsProcessing = function() {
  this.status = 'processing';
  return this.save();
};

// Método para marcar como concluído
reportSchema.methods.markAsCompleted = function(fileData) {
  this.status = 'completed';
  this.generatedAt = new Date();
  this.file = fileData;
  return this.save();
};

// Método para marcar como falhou
reportSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.processingOptions.errorMessage = errorMessage;
  this.processingOptions.retryCount += 1;
  return this.save();
};

// Método para calcular tamanho estimado do relatório
reportSchema.methods.calculateEstimatedSize = function() {
  const baseSize = 1024; // 1KB base
  const weatherDataSize = this.data.weatherData.length * 0.1; // 0.1KB por registro
  const alertsSize = this.data.alerts.length * 0.05; // 0.05KB por alerta
  const chartsSize = this.settings.includeCharts ? 500 : 0; // 500KB para gráficos
  const mapsSize = this.settings.includeMaps ? 200 : 0; // 200KB para mapas
  
  return Math.round(baseSize + weatherDataSize + alertsSize + chartsSize + mapsSize);
};

// Método para gerar nome do arquivo
reportSchema.methods.generateFilename = function() {
  const timestamp = new Date().toISOString().split('T')[0];
  const location = this.settings.location.name.replace(/\s+/g, '_');
  const type = this.type;
  const extension = this.settings.format;
  
  return `${type}_${location}_${timestamp}.${extension}`;
};

module.exports = mongoose.model('Report', reportSchema);
