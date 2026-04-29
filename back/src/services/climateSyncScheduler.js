const { runClimateSync } = require('./climateSyncService');

function parseIntInRange(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

function msUntilNextRun(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function startClimateAutoSyncScheduler({ sequelize, models }) {
  const enabled = process.env.ENABLE_CLIMATE_AUTO_SYNC === 'true';
  if (!enabled) {
    console.log('[sync:climate:auto] Desabilitado (ENABLE_CLIMATE_AUTO_SYNC != true).');
    return () => {};
  }

  const hour = parseIntInRange(process.env.CLIMATE_AUTO_SYNC_HOUR, 3, 0, 23);
  const minute = parseIntInRange(process.env.CLIMATE_AUTO_SYNC_MINUTE, 0, 0, 59);
  const everyHours = parseIntInRange(process.env.CLIMATE_AUTO_SYNC_EVERY_HOURS, 0, 0, 168);
  const runOnBoot = process.env.CLIMATE_AUTO_SYNC_RUN_ON_BOOT === 'true';
  const dailyMs = 24 * 60 * 60 * 1000;
  let timeoutHandle = null;
  let intervalHandle = null;
  let running = false;

  const runOnce = async () => {
    if (running) {
      console.log('[sync:climate:auto] Execução ignorada: já existe sync em andamento.');
      return;
    }
    running = true;
    const startedAt = Date.now();
    console.log('[sync:climate:auto] Iniciando sincronização agendada...');
    try {
      const out = await runClimateSync({ sequelize, models });
      if (!out.ok) {
        console.error('[sync:climate:auto] Falha:', out.error || 'erro desconhecido');
      } else {
        console.log(`[sync:climate:auto] Concluída em ${Date.now() - startedAt} ms.`);
      }
    } catch (error) {
      console.error('[sync:climate:auto] Erro na execução:', error?.message || error);
    } finally {
      running = false;
    }
  };

  const scheduleRecurring = (intervalMs) => {
    intervalHandle = setInterval(() => {
      void runOnce();
    }, intervalMs);
    if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
  };

  if (everyHours > 0) {
    const intervalMs = everyHours * 60 * 60 * 1000;
    console.log(`[sync:climate:auto] Agendado para executar a cada ${everyHours} hora(s).`);
    if (runOnBoot) {
      void runOnce();
    }
    scheduleRecurring(intervalMs);
  } else {
    const initialDelay = msUntilNextRun(hour, minute);
    console.log(
      `[sync:climate:auto] Agendado para ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} diariamente.`
    );

    timeoutHandle = setTimeout(() => {
      void runOnce();
      scheduleRecurring(dailyMs);
    }, initialDelay);
    if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();

    if (runOnBoot) {
      void runOnce();
    }
  }

  return () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (intervalHandle) clearInterval(intervalHandle);
  };
}

module.exports = {
  startClimateAutoSyncScheduler,
};
