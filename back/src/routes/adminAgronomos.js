const express = require('express');
const DualUserProfile = require('../models/DualUserProfile');
const { clerkAdminAuth } = require('../middleware/clerkAdminAuth');

const router = express.Router();

router.use(clerkAdminAuth);

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf11(digits) {
  const s = String(digits || '').replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += parseInt(s[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(s[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += parseInt(s[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(s[10], 10);
}

function maskCpf(digits) {
  if (!digits || digits.length < 11) return digits || null;
  return `***.***.${ digits.slice(6, 9)}-${digits.slice(9)}`;
}

function serializeAgronomo(item) {
  const soma = item.parceiroAvaliacaoSoma ?? 0;
  const qtd = item.parceiroAvaliacaoQtd ?? 0;
  const avaliacao = qtd > 0 ? Math.round((soma / qtd) * 10) / 10 : null;
  return {
    id: item.id,
    nome: item.nome,
    email: item.email,
    whatsapp: item.whatsapp,
    telefone: item.telefone,
    municipio: item.municipio,
    uf: item.uf,
    crea: item.crea,
    especialidade: item.especialidade,
    cpf: maskCpf(item.cpf),
    parceiroAtivo: Boolean(item.parceiroAtivo),
    whatsappVerificadoEm: item.whatsappVerificadoEm ?? null,
    avaliacao,
    totalAvaliacoes: qtd,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// GET /api/admin/agronomos?status=pendente|ativo|todos
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = { tipo: 'agronomo', parceiro: true };

    if (status === 'pendente') where.parceiroAtivo = false;
    else if (status === 'ativo') where.parceiroAtivo = true;

    const rows = await DualUserProfile.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return res.json({ agronomos: rows.map(serializeAgronomo) });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao listar agrônomos.' });
  }
});

// POST /api/admin/agronomos — cadastro manual direto (parceiroAtivo: true)
router.post('/', async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const especialidade = String(req.body?.especialidade || '').trim();
    const whatsapp = onlyDigits(req.body?.whatsapp);
    const telefone = String(req.body?.telefone || '').trim();
    const municipio = String(req.body?.municipio || '').trim();
    const uf = String(req.body?.uf || '').trim().toUpperCase();
    const crea = String(req.body?.crea || '').trim();
    const cpfDigits = onlyDigits(req.body?.cpf);

    if (!nome || !email || !especialidade || !whatsapp) {
      return res.status(400).json({
        message: 'Campos obrigatórios: nome, email, especialidade e whatsapp.',
      });
    }
    if (cpfDigits && (cpfDigits.length !== 11 || !isValidCpf11(cpfDigits))) {
      return res.status(400).json({ message: 'CPF inválido.' });
    }

    const clerkUserId = `admin:${email}`;
    const [profile, created] = await DualUserProfile.findOrCreate({
      where: { email },
      defaults: {
        clerkUserId,
        nome,
        email,
        tipo: 'agronomo',
        telefone,
        municipio,
        uf,
        especialidade,
        crea,
        cpf: cpfDigits || null,
        parceiro: true,
        parceiroAtivo: true,
        whatsapp,
      },
    });

    if (!created) {
      await profile.update({
        nome,
        telefone,
        municipio,
        uf,
        especialidade,
        crea,
        ...(cpfDigits ? { cpf: cpfDigits } : {}),
        parceiro: true,
        parceiroAtivo: true,
        whatsapp,
      });
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Agrônomo cadastrado com sucesso.' : 'Agrônomo atualizado com sucesso.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao cadastrar agrônomo.' });
  }
});

// PATCH /api/admin/agronomos/:id — aprovar, desativar, editar campos
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await DualUserProfile.findOne({
      where: { id, tipo: 'agronomo', parceiro: true },
    });
    if (!profile) {
      return res.status(404).json({ message: 'Agrônomo não encontrado.' });
    }

    const ALLOWED = ['nome', 'email', 'whatsapp', 'telefone', 'municipio', 'uf', 'crea', 'especialidade', 'parceiroAtivo'];
    const updates = {};
    for (const key of ALLOWED) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.whatsapp) updates.whatsapp = onlyDigits(updates.whatsapp);

    await profile.update(updates);
    return res.json({ success: true, message: 'Agrônomo atualizado com sucesso.' });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao atualizar agrônomo.' });
  }
});

// DELETE /api/admin/agronomos/:id — remoção suave (parceiro=false)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await DualUserProfile.findOne({
      where: { id, tipo: 'agronomo', parceiro: true },
    });
    if (!profile) {
      return res.status(404).json({ message: 'Agrônomo não encontrado.' });
    }
    await profile.update({ parceiro: false, parceiroAtivo: false });
    return res.json({ success: true, message: 'Agrônomo removido com sucesso.' });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao remover agrônomo.' });
  }
});

module.exports = router;
