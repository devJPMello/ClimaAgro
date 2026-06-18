const express = require('express');
const { Op } = require('sequelize');
const DualUserProfile = require('../models/DualUserProfile');

const router = express.Router();

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

router.get('/', async (req, res) => {
  try {
    const { uf, especialidade, ativo } = req.query;
    const where = {
      tipo: 'agronomo',
      parceiro: true,
    };

    const ativoFilter = String(ativo || 'true').toLowerCase();
    if (ativoFilter === 'true' || ativoFilter === '1' || ativoFilter === 'sim') {
      where.parceiroAtivo = true;
    } else if (ativoFilter === 'false' || ativoFilter === '0') {
      where.parceiroAtivo = false;
    }

    if (String(uf || '').trim()) {
      where.uf = String(uf).trim().toUpperCase();
    }
    if (String(especialidade || '').trim()) {
      where.especialidade = { [Op.iLike]: `%${String(especialidade).trim()}%` };
    }

    const rows = await DualUserProfile.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: 300,
    });

    return res.json({
      agronomos: rows.map((item) => {
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
          parceiroAtivo: Boolean(item.parceiroAtivo),
          avaliacao,
          totalAvaliacoes: qtd,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao listar agrônomos parceiros.' });
  }
});

router.post('/cadastro', async (req, res) => {
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
    const clerkUserId = String(req.body?.clerkUserId || `email:${email}`).trim();

    if (!nome || !email || !especialidade || !whatsapp) {
      return res.status(400).json({
        message: 'Campos obrigatórios: nome, email, especialidade e whatsapp.',
      });
    }
    if (!cpfDigits || cpfDigits.length !== 11 || !isValidCpf11(cpfDigits)) {
      return res.status(400).json({
        message: 'CPF inválido. Informe os 11 dígitos com dígitos verificadores corretos.',
      });
    }

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
        cpf: cpfDigits,
        parceiro: true,
        parceiroAtivo: false,
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
        cpf: cpfDigits,
        parceiro: true,
        whatsapp,
      });
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? 'Cadastro recebido com sucesso! Seu perfil passará por análise antes de aparecer na plataforma.'
        : 'Cadastro atualizado. Aguarde a revisão pela equipe ClimaAgro.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao cadastrar agrônomo parceiro.' });
  }
});

module.exports = router;
