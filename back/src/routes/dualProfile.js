const express = require('express');
const { models } = require('../config/database');
const { normalizeUf } = require('../utils/brazilUfs');

const router = express.Router();

function clerkUserIdFromReq(req) {
  return String(req.headers['x-clerk-user-id'] || '').trim();
}

/**
 * GET /api/dual-profile/me — perfil ClimaAgro (dual_user_profiles) do utilizador Clerk.
 */
router.get('/me', async (req, res) => {
  try {
    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login.' });
    }
    const row = await models.DualUserProfile.findOne({
      where: { clerkUserId },
      attributes: ['uf', 'municipio', 'nome', 'email', 'telefone', 'tipo'],
    });
    return res.json({ profile: row });
  } catch (e) {
    console.error('dual-profile GET /me:', e);
    return res.status(500).json({ message: 'Erro ao carregar perfil.' });
  }
});

/**
 * PUT /api/dual-profile/me — cria ou atualiza UF/município (e telefone) para IAgro, alertas e dados regionais.
 */
router.put('/me', async (req, res) => {
  try {
    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login.' });
    }

    const body = req.body || {};
    let ufVal = null;
    if (body.uf !== undefined && body.uf !== null && String(body.uf).trim() !== '') {
      const u = normalizeUf(body.uf);
      if (!u) {
        return res.status(400).json({ message: 'UF inválida.' });
      }
      ufVal = u;
    }

    const municipio =
      body.municipio !== undefined
        ? String(body.municipio || '')
            .trim()
            .slice(0, 120)
        : undefined;
    const telefone =
      body.telefone !== undefined
        ? String(body.telefone || '')
            .trim()
            .slice(0, 32)
        : undefined;
    const nomeIn =
      body.nome !== undefined
        ? String(body.nome || '')
            .trim()
            .slice(0, 120)
        : undefined;
    const emailIn =
      body.email !== undefined
        ? String(body.email || '')
            .trim()
            .slice(0, 160)
        : undefined;

    let row = await models.DualUserProfile.findOne({ where: { clerkUserId } });

    if (!row) {
      const nome = nomeIn || 'Produtor';
      const email = emailIn || `user-${clerkUserId.slice(0, 24)}@climaagro.placeholder`;
      row = await models.DualUserProfile.create({
        clerkUserId,
        nome,
        email,
        tipo: 'produtor',
        uf: ufVal,
        municipio: municipio !== undefined ? municipio || null : null,
        telefone: telefone !== undefined ? telefone || null : null,
      });
    } else {
      const patch = {};
      if (body.uf !== undefined) patch.uf = ufVal;
      if (municipio !== undefined) patch.municipio = municipio || null;
      if (telefone !== undefined) patch.telefone = telefone || null;
      if (nomeIn) patch.nome = nomeIn;
      if (emailIn) patch.email = emailIn;
      if (Object.keys(patch).length) {
        await row.update(patch);
      }
      await row.reload({
        attributes: ['uf', 'municipio', 'nome', 'email', 'telefone', 'tipo'],
      });
    }

    return res.json({
      profile: {
        uf: row.uf,
        municipio: row.municipio,
        nome: row.nome,
        email: row.email,
        telefone: row.telefone,
        tipo: row.tipo,
      },
    });
  } catch (e) {
    console.error('dual-profile PUT /me:', e);
    return res.status(500).json({ message: 'Erro ao salvar perfil.' });
  }
});

module.exports = router;
