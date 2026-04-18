const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../config/database');

const router = express.Router();
const { ReportExport } = models;

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

function requireExportClientId(req, res, next) {
  const raw = req.header('x-export-client-id') || req.header('X-Export-Client-Id');
  const key = raw != null ? String(raw).trim() : '';
  if (key.length < 8 || key.length > 64) {
    return res.status(400).json({
      success: false,
      message: 'Envie o cabeçalho X-Export-Client-Id (ex.: UUID persistido no navegador).'
    });
  }
  req.exportClientId = key;
  next();
}

function toDto(row) {
  const created = row.createdAt ? new Date(row.createdAt) : new Date();
  return {
    id: row.id,
    tipo: row.reportTypeLabel,
    local: row.localityLabel,
    periodo: row.periodLabel,
    formato: String(row.format || '').toUpperCase(),
    status: row.status,
    data: created.toLocaleString('pt-BR'),
    foiGeradoComIA: Boolean(row.generatedWithAi)
  };
}

// GET /api/reports/exports
router.get('/exports', requireExportClientId, async (req, res) => {
  try {
    const rows = await ReportExport.findAll({
      where: { clientKey: req.exportClientId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ items: rows.map(toDto) });
  } catch (e) {
    console.error('reports exports list:', e);
    res.status(500).json({ success: false, message: 'Erro ao listar exportações.' });
  }
});

// POST /api/reports/exports
router.post(
  '/exports',
  requireExportClientId,
  [
    body('tipo').isString().isLength({ min: 1, max: 160 }),
    body('local').isString().isLength({ min: 1, max: 200 }),
    body('periodo').isString().isLength({ min: 1, max: 240 }),
    body('formato').isString().isLength({ min: 1, max: 16 }),
    body('status').optional().isIn(['registrado', 'processando', 'concluido', 'falha']),
    body('foiGeradoComIA').optional().isBoolean(),
    validateRequest
  ],
  async (req, res) => {
    try {
      const { tipo, local, periodo, formato, status = 'registrado', foiGeradoComIA = false } = req.body;
      const row = await ReportExport.create({
        clientKey: req.exportClientId,
        reportTypeLabel: tipo,
        localityLabel: local,
        periodLabel: periodo,
        format: String(formato).toLowerCase(),
        status,
        generatedWithAi: Boolean(foiGeradoComIA)
      });
      res.status(201).json({ item: toDto(row) });
    } catch (e) {
      console.error('reports exports create:', e);
      res.status(500).json({ success: false, message: 'Erro ao registrar exportação.' });
    }
  }
);

module.exports = router;
