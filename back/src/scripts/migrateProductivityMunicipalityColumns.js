/**
 * Migração: colunas de município/UF em `productivity`, geo_data_id opcional,
 * UNIQUE (state, municipality_key, year, product_label).
 *
 *   node src/scripts/migrateProductivityMunicipalityColumns.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize, models } = require('../config/database');
const { Productivity } = models;
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');

async function main() {
  await sequelize.authenticate();
  const t = await sequelize.transaction();

  try {
    await sequelize.query(
      `
      ALTER TABLE productivity ADD COLUMN IF NOT EXISTS state VARCHAR(2);
      ALTER TABLE productivity ADD COLUMN IF NOT EXISTS municipality_name VARCHAR(200);
      ALTER TABLE productivity ADD COLUMN IF NOT EXISTS municipality_key VARCHAR(220);
      ALTER TABLE productivity ADD COLUMN IF NOT EXISTS municipality_ibge_code VARCHAR(7);
      `,
      { transaction: t }
    );

    await sequelize.query(
      `
      UPDATE productivity p
      SET
        state = COALESCE(NULLIF(trim(g.state::text), ''), 'TO'),
        municipality_name = COALESCE(NULLIF(trim(g.name::text), ''), '—'),
        municipality_ibge_code = CASE
          WHEN g.ibge_code IS NOT NULL AND length(regexp_replace(g.ibge_code::text, '\\D', '', 'g')) = 7
          THEN regexp_replace(g.ibge_code::text, '\\D', '', 'g')
          ELSE NULL
        END
      FROM geo_data g
      WHERE p.geo_data_id = g.id
        AND (p.municipality_name IS NULL OR btrim(p.municipality_name::text) = '');
      `,
      { transaction: t }
    );

    await sequelize.query(
      `
      UPDATE productivity
      SET
        state = 'TO',
        municipality_name = COALESCE(NULLIF(btrim(municipality_name::text), ''), '—')
      WHERE municipality_name IS NULL OR btrim(municipality_name::text) = '';
      `,
      { transaction: t }
    );

    await sequelize.query(`ALTER TABLE productivity ALTER COLUMN geo_data_id DROP NOT NULL;`, { transaction: t });

    await sequelize.query(`DROP INDEX IF EXISTS productivity_geo_year_product_label_uidx;`, { transaction: t });

    await sequelize.query(
      `
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN (
          SELECT c.conname AS name
          FROM pg_constraint c
          JOIN pg_class rel ON rel.oid = c.conrelid
          WHERE rel.relname = 'productivity' AND c.contype = 'u'
        ) LOOP
          IF r.name LIKE '%geo_data_id%' AND r.name LIKE '%year%' AND r.name LIKE '%product%'
             AND r.name NOT LIKE '%municipality%' THEN
            EXECUTE format('ALTER TABLE productivity DROP CONSTRAINT IF EXISTS %I', r.name);
          END IF;
        END LOOP;
      END $$;
      `,
      { transaction: t }
    );

    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }

  const rows = await Productivity.findAll({ attributes: ['id', 'municipalityName'] });
  for (const row of rows) {
    const name = String(row.municipalityName || '—').trim() || '—';
    const k = normalizeMunicipalityKey(name);
    await row.update({
      municipalityName: name,
      municipalityKey: k || 'unknown',
    });
  }

  const t2 = await sequelize.transaction();
  try {
    await sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS productivity_state_munkey_year_product_uidx
      ON productivity (state, municipality_key, year, product_label);
      `,
      { transaction: t2 }
    );

    await sequelize.query(
      `ALTER TABLE productivity ALTER COLUMN state SET NOT NULL;`,
      { transaction: t2 }
    );
    await sequelize.query(
      `ALTER TABLE productivity ALTER COLUMN municipality_name SET NOT NULL;`,
      { transaction: t2 }
    );
    await sequelize.query(
      `ALTER TABLE productivity ALTER COLUMN municipality_key SET NOT NULL;`,
      { transaction: t2 }
    );

    await t2.commit();
    console.log('✅ migrateProductivityMunicipalityColumns concluído.');
  } catch (e) {
    await t2.rollback();
    throw e;
  }

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ migrateProductivityMunicipalityColumns:', e.message || e);
  process.exit(1);
});
