/**
 * Migração: adiciona `product_label`, troca UNIQUE (geo_data_id, year, crop_type)
 * por (geo_data_id, year, product_label).
 *
 * Rode uma vez após atualizar o modelo:
 *   node src/scripts/migrateProductivityProductLabel.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');

async function main() {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  const t = await sequelize.transaction();

  try {
    const desc = await qi.describeTable('productivity');
    if (!desc.product_label) {
      await sequelize.query(
        `ALTER TABLE productivity ADD COLUMN product_label VARCHAR(300);`,
        { transaction: t }
      );
    }

    await sequelize.query(
      `
      UPDATE productivity
      SET product_label = trim(regexp_replace(observations, '^SIDRA 1612 · ', ''))
      WHERE observations ~ '^SIDRA 1612 ·'
        AND (product_label IS NULL OR btrim(product_label) = '');
      `,
      { transaction: t }
    );

    await sequelize.query(
      `
      UPDATE productivity
      SET product_label = crop_type::text
      WHERE product_label IS NULL OR btrim(product_label) = '';
      `,
      { transaction: t }
    );

    const [constraints] = await sequelize.query(
      `
      SELECT c.conname AS name
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      WHERE rel.relname = 'productivity' AND c.contype = 'u';
      `,
      { transaction: t }
    );

    for (const row of constraints) {
      const n = row.name;
      if (!n) continue;
      if (
        n.includes('geo_data_id') &&
        n.includes('year') &&
        n.includes('crop_type') &&
        !n.includes('product_label')
      ) {
        await sequelize.query(`ALTER TABLE productivity DROP CONSTRAINT IF EXISTS "${n}";`, { transaction: t });
      }
    }

    await sequelize.query(`DROP INDEX IF EXISTS productivity_geo_data_id_year_crop_type;`, { transaction: t });

    await sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS productivity_geo_year_product_label_uidx
      ON productivity (geo_data_id, year, product_label);
      `,
      { transaction: t }
    );

    await sequelize.query(
      `ALTER TABLE productivity ALTER COLUMN product_label SET NOT NULL;`,
      { transaction: t }
    );

    await t.commit();
    console.log('✅ migrateProductivityProductLabel concluído.');
  } catch (e) {
    await t.rollback();
    throw e;
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => {
  console.error('❌ migrateProductivityProductLabel:', e.message || e);
  process.exit(1);
});
