const express = require('express');

/**
 * Rotas legadas de alertas persistidos em MongoDB (modelo Mongoose).
 * O projeto atual usa PostgreSQL; alertas para o front estão em GET /api/climate/alerts.
 */
const router = express.Router();

router.all('*', (req, res) => {
  res.status(501).json({
    success: false,
    message:
      'Endpoint legado não disponível nesta versão. Use GET /api/climate/alerts (lista para o app) ou integre alertas no PostgreSQL.'
  });
});

module.exports = router;
