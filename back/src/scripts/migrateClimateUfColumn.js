const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');

async function ensureUfColumnAndBackfill() {
  await sequelize.query(`
    ALTER TABLE climate_data
    ADD COLUMN IF NOT EXISTS uf VARCHAR(2);
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_climate_data_uf ON climate_data(uf);
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_climate_data_uf_date ON climate_data(uf, date);
  `);

  const [updatedRows] = await sequelize.query(`
    UPDATE climate_data cd
       SET uf = UPPER(COALESCE(gd.state, cd.uf))
      FROM geo_data gd
     WHERE cd.geo_data_id = gd.id
       AND gd.state IS NOT NULL
       AND (cd.uf IS NULL OR cd.uf <> UPPER(gd.state));
  `);

  return updatedRows;
}

(async () => {
  try {
    const updated = await ensureUfColumnAndBackfill();
    console.log(`✅ Migração de UF concluída. Linhas atualizadas: ${updated || 0}`);
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha na migração de UF:', error.message || error);
    process.exit(1);
  }
})();
