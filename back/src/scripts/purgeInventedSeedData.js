/**
 * Remove dados inseridos pelas seeds de demonstração (não apaga ingestão CPTEC/INMET real).
 *
 * Uso:
 *   node src/scripts/purgeInventedSeedData.js
 *   node src/scripts/purgeInventedSeedData.js --productivity --yes   # apaga TODAS as linhas de productivity
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Op } = require('sequelize');
const { connectDB, sequelize, models } = require('../config/database');
const { ClimateData, Productivity } = models;

async function purgeClimateSeedRows() {
  const removed = await ClimateData.destroy({
    where: {
      [Op.or]: [
        { stationCode: { [Op.in]: ['SEED', 'SEED-ALERT'] } },
        { stationCode: { [Op.like]: 'SEED%' } },
        {
          [Op.and]: [
            { stationCode: { [Op.in]: ['A001', 'A002'] } },
            { weatherStation: { [Op.in]: ['Cuiabá', 'Curitiba'] } }
          ]
        }
      ]
    }
  });
  console.log(`✅ climate_data: ${removed} registro(s) de seed removido(s).`);
  return removed;
}

async function purgeAllProductivity() {
  const removed = await Productivity.destroy({ where: {} });
  console.log(`✅ productivity: ${removed} registro(s) removido(s) (tabela esvaziada).`);
  return removed;
}

(async () => {
  try {
    await connectDB();
    await purgeClimateSeedRows();

    const prod = process.argv.includes('--productivity');
    const yes = process.argv.includes('--yes');
    if (prod) {
      if (!yes) {
        console.error(
          '❌ Para apagar toda a tabela productivity, execute com: --productivity --yes'
        );
        await sequelize.close();
        process.exit(1);
      }
      await purgeAllProductivity();
    } else {
      console.log(
        'ℹ️  Produtividade fictícia (CONAB de exemplo) não foi removida. Para esvaziar `productivity`: node src/scripts/purgeInventedSeedData.js --productivity --yes'
      );
    }

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌', e.message || e);
    process.exit(1);
  }
})();
