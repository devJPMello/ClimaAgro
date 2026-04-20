/**
 * Migra `productivity.crop_type` de ENUM para VARCHAR(80) e recalcula valores
 * com `mapProductLabelToCropType` (slugs em vez de "outros" genérico).
 *
 *   node src/scripts/migrateCropTypeEnumToVarchar.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { QueryTypes } = require('sequelize');
const { sequelize, models } = require('../config/database');
const { Productivity } = models;
const { mapProductLabelToCropType } = require('../utils/sidra1612ProductCropMap');

async function main() {
  await sequelize.authenticate();
  const [col] = await sequelize.query(
    `
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'productivity' AND column_name = 'crop_type'
    `,
    { type: QueryTypes.SELECT }
  );
  const dt = col && col.data_type;
  if (dt !== 'character varying' && dt !== 'varchar') {
    const t = await sequelize.transaction();
    try {
      await sequelize.query(
        `ALTER TABLE productivity ALTER COLUMN crop_type TYPE VARCHAR(80) USING crop_type::text;`,
        { transaction: t }
      );
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
    console.log('✅ Coluna crop_type alterada para VARCHAR(80).');
  } else {
    console.log('ℹ️  crop_type já é VARCHAR; pulando ALTER.');
  }

  const rows = await Productivity.findAll({
    attributes: ['id', 'productLabel', 'cropType'],
    raw: true,
  });
  let updated = 0;
  for (const r of rows) {
    const next = mapProductLabelToCropType(r.productLabel);
    if (!next || next === r.cropType) continue;
    await Productivity.update({ cropType: next }, { where: { id: r.id } });
    updated += 1;
  }

  console.log(`✅ crop_type é VARCHAR(80). Linhas atualizadas a partir de product_label: ${updated}.`);
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ migrateCropTypeEnumToVarchar:', e.message || e);
  process.exit(1);
});
