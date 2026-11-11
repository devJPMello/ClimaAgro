const express = require('express');
const { models } = require('../config/database');
const { Op } = require('sequelize');
const { normalizeUf } = require('../utils/brazilUfs');
const { deleteStoredFile } = require('../services/iagroMediaStorage');
const diarioService = require('../services/diarioService');

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
      attributes: ['uf', 'municipio', 'nome', 'email', 'tipo', 'notifAlertasCriticos', 'notifRelatorios', 'notifAtualizacoes', 'lgpdConsentDate'],
    });
    return res.json({ profile: row });
  } catch (e) {
    console.error('dual-profile GET /me:', e);
    return res.status(500).json({ message: 'Erro ao carregar perfil.' });
  }
});

/**
 * PUT /api/dual-profile/me — cria ou atualiza UF/município para IAgro, alertas e dados regionais.
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
      });
    } else {
      const patch = {};
      if (body.uf !== undefined) patch.uf = ufVal;
      if (municipio !== undefined) patch.municipio = municipio || null;
      if (nomeIn) patch.nome = nomeIn;
      if (emailIn) patch.email = emailIn;
      if (typeof body.notifAlertasCriticos === 'boolean') patch.notifAlertasCriticos = body.notifAlertasCriticos;
      if (typeof body.notifRelatorios === 'boolean') patch.notifRelatorios = body.notifRelatorios;
      if (typeof body.notifAtualizacoes === 'boolean') patch.notifAtualizacoes = body.notifAtualizacoes;
      if (body.lgpdConsentDate) patch.lgpdConsentDate = new Date(body.lgpdConsentDate);
      if (Object.keys(patch).length) {
        await row.update(patch);
      }
      await row.reload({
        attributes: ['uf', 'municipio', 'nome', 'email', 'tipo', 'notifAlertasCriticos', 'notifRelatorios', 'notifAtualizacoes', 'lgpdConsentDate'],
      });
    }

    return res.json({
      profile: {
        uf: row.uf,
        municipio: row.municipio,
        nome: row.nome,
        email: row.email,
        tipo: row.tipo,
        notifAlertasCriticos: row.notifAlertasCriticos,
        notifRelatorios: row.notifRelatorios,
        notifAtualizacoes: row.notifAtualizacoes,
        lgpdConsentDate: row.lgpdConsentDate ?? null,
      },
    });
  } catch (e) {
    console.error('dual-profile PUT /me:', e);
    return res.status(500).json({ message: 'Erro ao salvar perfil.' });
  }
});

/**
 * DELETE /api/dual-profile/me — exclui todos os dados do usuário (LGPD art. 18, VI — direito ao esquecimento).
 * Remove: DualUserProfile, ChatHistory, os anexos enviados ao IAgro e o Diário de Campo (registros e fotos).
 */
router.delete('/me', async (req, res) => {
  try {
    const clerkUserId = clerkUserIdFromReq(req);
    if (!clerkUserId) {
      return res.status(401).json({ message: 'Faça login.' });
    }

    const profile = await models.DualUserProfile.findOne({ where: { clerkUserId } });
    if (!profile) {
      return res.status(404).json({ message: 'Perfil não encontrado.' });
    }

    const comAnexos = await models.ChatHistory.findAll({
      where: { clerkUserId, attachments: { [Op.ne]: null } },
      attributes: ['attachments'],
    });
    await models.ChatHistory.destroy({ where: { clerkUserId } });
    const chaves = comAnexos.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : []).map((a) => a.key));
    await Promise.all(chaves.map((k) => deleteStoredFile(k)));
    const chavesDiario = await diarioService.removerTodos(clerkUserId);
    await Promise.all(chavesDiario.map((k) => deleteStoredFile(k)));
    await profile.destroy();

    return res.json({
      success: true,
      message: 'Conta e dados pessoais removidos com sucesso. Conforme a LGPD, art. 18, VI.',
    });
  } catch (e) {
    console.error('dual-profile DELETE /me:', e);
    return res.status(500).json({ message: 'Erro ao excluir conta.' });
  }
});

module.exports = router;
