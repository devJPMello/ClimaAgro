const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Nome é obrigatório'
      },
      len: {
        args: [2, 50],
        msg: 'Nome deve ter entre 2 e 50 caracteres'
      }
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'Email inválido'
      },
      notEmpty: {
        msg: 'Email é obrigatório'
      }
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: {
        args: [6, 255],
        msg: 'Senha deve ter pelo menos 6 caracteres'
      }
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    validate: {
      is: {
        args: /^\(\d{2}\)\s\d{4,5}-\d{4}$/,
        msg: 'Formato de telefone inválido'
      }
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  favoriteMunicipality: {
    type: DataTypes.STRING(100)
  },
  notificationPreference: {
    type: DataTypes.ENUM('email', 'sms', 'both', 'none'),
    defaultValue: 'email'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastAccess: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  exportedReports: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Dados de OAuth (opcional)
  googleId: {
    type: DataTypes.STRING
  },
  facebookId: {
    type: DataTypes.STRING
  },
  // Tokens de reset de senha
  resetPasswordToken: {
    type: DataTypes.STRING
  },
  resetPasswordExpire: {
    type: DataTypes.DATE
  },
  // Email de verificação
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailVerificationToken: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Método para comparar senhas
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para atualizar último acesso
User.prototype.updateLastAccess = async function() {
  this.lastAccess = new Date();
  return await this.save();
};

// Método para incrementar relatórios exportados
User.prototype.incrementExportedReports = async function() {
  this.exportedReports += 1;
  return await this.save();
};

module.exports = User;
