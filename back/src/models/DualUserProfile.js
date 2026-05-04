const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DualUserProfile = sequelize.define(
  'DualUserProfile',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clerkUserId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'clerk_user_id',
    },
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM('produtor', 'agronomo'),
      allowNull: false,
      defaultValue: 'produtor',
    },
    telefone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    municipio: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    uf: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    especialidade: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    crea: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    /** CPF somente dígitos (11), para validação cadastral / LGPD. */
    cpf: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: 'cpf',
    },
    parceiro: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    parceiroAtivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'parceiro_ativo',
    },
    whatsapp: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    /** Soma das notas (1–5) recebidas em atendimentos encerrados com avaliação. */
    parceiroAvaliacaoSoma: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'parceiro_avaliacao_soma',
    },
    /** Quantidade de avaliações agregadas na média. */
    parceiroAvaliacaoQtd: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'parceiro_avaliacao_qtd',
    },
  },
  {
    tableName: 'dual_user_profiles',
    timestamps: true,
    indexes: [
      { fields: ['tipo'] },
      { fields: ['email'] },
      { fields: ['parceiro'] },
    ],
  }
);

module.exports = DualUserProfile;
