/**
 * Inicializa o PostgreSQL (conexão, PostGIS, sequelize.sync em development).
 * Rode antes do servidor: npm run db:init
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { connectDB, sequelize } = require('../config/database');

(async () => {
  try {
    await connectDB();
    console.log('🎉 Banco pronto para uso.');
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Falha ao preparar o banco:', e.message || e);
    process.exit(1);
  }
})();
