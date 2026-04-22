const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const { query, validationResult } = require('express-validator');
const { sequelize, models } = require('../config/database');
const { mapProductLabelToCropType } = require('../utils/sidra1612ProductCropMap');

const router = express.Router();
const { IbgeSidra1612Row } = models;

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Parâmetros inválidos', errors: errors.array() });
  }
  return next();
}

/**
 * GET /api/ibge-sidra-1612/product-labels
 * Produtos (`product_label`) distintos na tabela `ibge_sidra_1612` para UFs.
 * Inclui `cropType` mapeado como na sincronização com `productivity`.
 */
router.get(
  '/product-labels',
  [query('state').optional().isString().isLength({ min: 2, max: 2 })],
  validateRequest,
  async (req, res) => {
    try {
      const raw = req.query.state != null ? String(req.query.state).trim().toUpperCase().slice(0, 2) : '';
      const uf = /^[A-Z]{2}$/.test(raw) ? raw : null;
      const rows = await sequelize.query(
        `
        SELECT DISTINCT TRIM(i.product_label) AS "productLabel"
        FROM ibge_sidra_1612 i
        INNER JOIN geo_data g
          ON LOWER(TRIM(g.name)) = LOWER(TRIM(i.municipality_name))
          AND g.category = 'state'
          AND g.is_active = true
        WHERE TRIM(i.product_label) <> ''
          AND LOWER(TRIM(i.product_label)) <> 'total'
          AND (:uf::text IS NULL OR g.state = :uf)
        ORDER BY 1 ASC
        `,
        { replacements: { uf: uf || null }, type: QueryTypes.SELECT }
      );
      const data = rows
        .map((r) => ({
          productLabel: r.productLabel,
          cropType: mapProductLabelToCropType(r.productLabel),
        }))
        .filter((x) => x.productLabel && x.cropType);
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Erro GET /api/ibge-sidra-1612/product-labels:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao listar produtos SIDRA 1612',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

/**
 * GET /api/ibge-sidra-1612
 * Lê a tabela `ibge_sidra_1612` (formato longo SIDRA / ETL tabela 1612).
 *
 * Query:
 * - year (opcional)
 * - municipality (opcional, busca parcial sem case-sensitive)
 * - variable (opcional, filtra `variable_key`)
 * - product (opcional, filtra `product_label`)
 * - limit (1–500, default 100)
 * - offset (default 0)
 */
router.get(
  '/',
  [
    query('year').optional().isInt({ min: 1970, max: 2100 }),
    query('municipality').optional().isString().isLength({ min: 1, max: 200 }),
    query('variable').optional().isString().isLength({ min: 1, max: 200 }),
    query('product').optional().isString().isLength({ min: 1, max: 300 }),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const where = {};

      if (req.query.year != null && req.query.year !== '') {
        const y = parseInt(String(req.query.year), 10);
        if (Number.isFinite(y)) where.year = y;
      }

      if (req.query.municipality) {
        const t = String(req.query.municipality).trim();
        if (t) where.municipalityName = { [Op.iLike]: `%${t.replace(/%/g, '\\%')}%` };
      }

      if (req.query.variable) {
        const t = String(req.query.variable).trim();
        if (t) where.variableKey = { [Op.iLike]: `%${t.replace(/%/g, '\\%')}%` };
      }

      if (req.query.product) {
        const t = String(req.query.product).trim();
        if (t) where.productLabel = { [Op.iLike]: `%${t.replace(/%/g, '\\%')}%` };
      }

      const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
      const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const { rows, count } = await IbgeSidra1612Row.findAndCountAll({
        where,
        limit,
        offset,
        order: [
          ['year', 'DESC'],
          ['municipalityName', 'ASC'],
          ['variableKey', 'ASC'],
          ['productLabel', 'ASC'],
        ],
        attributes: [
          'id',
          'year',
          'municipalityName',
          'productLabel',
          'variableKey',
          'valueNumeric',
          'geoDataId',
        ],
        raw: true,
      });

      return res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          limit,
          offset,
          pages: limit ? Math.ceil(count / limit) : 0,
        },
      });
    } catch (error) {
      console.error('Erro GET /api/ibge-sidra-1612:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao consultar ibge_sidra_1612',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

module.exports = router;
