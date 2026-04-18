/**
 * Sincroniza clima e (opcionalmente) alertas oficiais a partir de fontes públicas configuradas no .env.
 * Não usa dados inventados — ver ../REAL_DATA.md
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { connectDB, sequelize, models } = require('../config/database');
const { runClimateSync } = require('../services/climateSyncService');

(async () => {
  try {
    await connectDB();
    console.log('🛰️  Sincronização com fontes oficiais (CPTEC / Open-Meteo / alertas INMET)…');
    const out = await runClimateSync({ sequelize, models });
    if (!out.ok) {
      console.error('❌ Falha:', out.error);
      await sequelize.close();
      process.exit(1);
    }
    console.log(JSON.stringify(out, null, 2));
    console.log('✅ Sincronização concluída.');
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌', e.message || e);
    process.exit(1);
  }
})();
