const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');

async function resetStateLevelData() {
  await sequelize.query('BEGIN');
  try {
    await sequelize.query('TRUNCATE TABLE climate_data RESTART IDENTITY CASCADE;');
    await sequelize.query('TRUNCATE TABLE productivity RESTART IDENTITY CASCADE;');
    await sequelize.query('TRUNCATE TABLE ibge_sidra_1612 RESTART IDENTITY CASCADE;');
    await sequelize.query('TRUNCATE TABLE official_alerts RESTART IDENTITY CASCADE;');
    await sequelize.query('TRUNCATE TABLE report_exports RESTART IDENTITY CASCADE;');
    await sequelize.query('COMMIT');
  } catch (error) {
    await sequelize.query('ROLLBACK');
    throw error;
  }
}

(async () => {
  try {
    await resetStateLevelData();
    console.log('✅ Limpeza concluída: climate_data, productivity, ibge_sidra_1612, official_alerts, report_exports.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha ao limpar dados:', error.message || error);
    try {
      await sequelize.close();
    } catch {}
    process.exit(1);
  }
})();
