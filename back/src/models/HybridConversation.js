const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HybridConversation = sequelize.define(
  'HybridConversation',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    produtorClerkId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'produtor_clerk_id',
    },
    iaThreadId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'ia_thread_id',
    },
    consultaAgronomicaId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'consulta_agronomica_id',
      references: { model: 'consultas_agronomicas', key: 'id' },
    },
    whatsappAgronomo: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'whatsapp_agronomo',
    },
    agronomoParceiroId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'agronomo_parceiro_id',
    },
    atendimentoAtivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'atendimento_ativo',
    },
    intervencaoHumana: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'intervencao_humana',
    },
    produtorNomeSnapshot: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'produtor_nome_snapshot',
    },
    casoResumoSnapshot: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'caso_resumo_snapshot',
    },
    /** Preenchido quando o produtor encerra o atendimento e envia avaliação (1–5). */
    avaliacaoEstrelas: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: 'avaliacao_estrelas',
    },
    avaliacaoComentario: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'avaliacao_comentario',
    },
    avaliacaoEm: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'avaliacao_em',
    },
  },
  {
    tableName: 'hybrid_conversations',
    timestamps: true,
    indexes: [
      { fields: ['produtor_clerk_id', 'ia_thread_id'], unique: true },
      { fields: ['whatsapp_agronomo', 'atendimento_ativo'] },
    ],
  }
);

module.exports = HybridConversation;
