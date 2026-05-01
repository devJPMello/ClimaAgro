const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConsultaAgronomica = sequelize.define(
  'ConsultaAgronomica',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    threadId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'thread_id',
    },
    status: {
      type: DataTypes.ENUM('novo', 'aguardando', 'em_andamento', 'concluido'),
      allowNull: false,
      defaultValue: 'novo',
    },
    urgencia: {
      type: DataTypes.ENUM('baixa', 'media', 'alta'),
      allowNull: false,
      defaultValue: 'media',
    },
    especialidade: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    assunto: {
      type: DataTypes.STRING(220),
      allowNull: false,
    },
    preview: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    conversa: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    produtorClerkId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'produtor_clerk_id',
    },
    produtorNome: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'produtor_nome',
    },
    produtorEmail: {
      type: DataTypes.STRING(160),
      allowNull: true,
      field: 'produtor_email',
    },
    produtorTelefone: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'produtor_telefone',
    },
    produtorMunicipio: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'produtor_municipio',
    },
    produtorUf: {
      type: DataTypes.STRING(2),
      allowNull: true,
      field: 'produtor_uf',
    },
    agronomoClerkId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'agronomo_clerk_id',
    },
    agronomoNome: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'agronomo_nome',
    },
    agronomoEspecialidade: {
      type: DataTypes.STRING(160),
      allowNull: false,
      field: 'agronomo_especialidade',
    },
    agronomoCrea: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'agronomo_crea',
    },
    agronomoMunicipio: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'agronomo_municipio',
    },
    agronomoUf: {
      type: DataTypes.STRING(2),
      allowNull: true,
      field: 'agronomo_uf',
    },
    agronomoAvaliacao: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: true,
      field: 'agronomo_avaliacao',
    },
    agronomoTempoResposta: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: 'agronomo_tempo_resposta',
    },
    dataSolicitacao: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'data_solicitacao',
    },
    dataAtualizacao: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'data_atualizacao',
    },
  },
  {
    tableName: 'consultas_agronomicas',
    timestamps: true,
    indexes: [
      { fields: ['agronomo_clerk_id'] },
      { fields: ['produtor_clerk_id'] },
      { fields: ['status'] },
      { fields: ['thread_id'] },
    ],
  }
);

module.exports = ConsultaAgronomica;
