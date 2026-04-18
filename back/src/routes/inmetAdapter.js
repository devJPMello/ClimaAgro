const express = require('express');
const { query, validationResult } = require('express-validator');
const {
  parseStationCodes,
  fmtDateOnlyBr,
  buildFeatureCollectionFromApitempo,
  fetchAndNormalizeInmetAlerts
} = require('../services/inmetAdapterService');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  const backDays = Number(process.env.INMET_ADAPTER_LOOKBACK_DAYS || 1);
  start.setDate(start.getDate() - backDays);
  return {
    startDate: fmtDateOnlyBr(start),
    endDate: fmtDateOnlyBr(end)
  };
}

router.get(
  '/features',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('stations').optional().isString(),
    validateRequest
  ],
  async (req, res) => {
    try {
      const defaults = defaultDateRange();
      const startDate = req.query.startDate || defaults.startDate;
      const endDate = req.query.endDate || defaults.endDate;
      const stationsRaw = req.query.stations || process.env.INMET_ADAPTER_STATION_CODES || '';
      const stationCodes = parseStationCodes(stationsRaw);

      if (!stationCodes.length) {
        return res.status(400).json({
          message:
            'Informe os códigos via ?stations=A009,A010 ou configure INMET_ADAPTER_STATION_CODES no .env.'
        });
      }

      const out = await buildFeatureCollectionFromApitempo({ startDate, endDate, stationCodes });
      return res.json(out);
    } catch (error) {
      return res.status(500).json({
        message: 'Falha ao montar FeatureCollection do adapter INMET',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

router.get('/alerts', async (req, res) => {
  try {
    const out = await fetchAndNormalizeInmetAlerts();
    return res.json(out);
  } catch (error) {
    return res.status(500).json({
      message: 'Falha ao carregar alertas INMET RSS/CAP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
