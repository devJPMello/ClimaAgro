const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE dual_user_profiles
      ADD COLUMN IF NOT EXISTS lgpd_consent_date TIMESTAMPTZ;
    `);
    console.log('✅ Coluna lgpd_consent_date adicionada em dual_user_profiles.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha na migração:', error.message || error);
    process.exit(1);
  }
})();
