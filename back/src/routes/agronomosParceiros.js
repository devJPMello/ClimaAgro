const express = require('express');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const DualUserProfile = require('../models/DualUserProfile');
const { clerkAuth } = require('../middleware/clerkAuth');
const evolutionService = require('../services/evolutionService');
const whatsappVerification = require('../services/whatsappVerification');

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
    const { uf, especialidade } = req.query;
    // Rota pública: só parceiros aprovados. Pendentes e desativados ficam no painel admin.
    const where = {
      tipo: 'agronomo',
      parceiro: true,
      parceiroAtivo: true,
    };

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

// ─── Cadastro do agrônomo (exige login) ─────────────────────────────────────

const codigoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Roda depois do clerkAuth, então sempre há um usuário identificado.
  keyGenerator: (req) => `whatsapp-codigo:${req.clerkUserId}`,
  message: { message: 'Muitos pedidos de código. Tente de novo em alguns minutos.' },
});

/** E-mail da conta no Clerk; sem a chave do Clerk (ambiente local), usa o informado. */
async function emailDaConta(clerkUserId, emailInformado) {
  if (process.env.CLERK_SECRET_KEY) {
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(clerkUserId);
    const principal = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId);
    return String(principal?.emailAddress || '').trim().toLowerCase();
  }
  return String(emailInformado || '').trim().toLowerCase();
}

function statusCadastro(profile) {
  if (!profile || !profile.parceiro) return 'nao_cadastrado';
  return profile.parceiroAtivo ? 'aprovado' : 'em_analise';
}

// GET /api/agronomos-parceiros/meu-cadastro — situação do cadastro de quem está logado
router.get('/meu-cadastro', clerkAuth, async (req, res) => {
  try {
    const profile = await DualUserProfile.findOne({ where: { clerkUserId: req.clerkUserId } });
    return res.json({
      status: statusCadastro(profile),
      cadastro: profile && profile.parceiro
        ? {
            nome: profile.nome,
            email: profile.email,
            whatsapp: profile.whatsapp,
            whatsappVerificadoEm: profile.whatsappVerificadoEm,
            municipio: profile.municipio,
            uf: profile.uf,
            crea: profile.crea,
            especialidade: profile.especialidade,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao consultar seu cadastro.' });
  }
});

// POST /api/agronomos-parceiros/whatsapp/codigo — envia o código de confirmação pelo WhatsApp
router.post('/whatsapp/codigo', clerkAuth, codigoLimiter, async (req, res) => {
  const numero = whatsappVerification.normalizarNumero(req.body?.whatsapp);
  if (!whatsappVerification.numeroValido(numero)) {
    return res.status(400).json({ message: 'WhatsApp inválido. Use DDD + número (ex.: 63999999999).' });
  }
  const gerado = whatsappVerification.gerarCodigo(req.clerkUserId, numero);
  if (!gerado.ok) {
    return res.status(429).json({ message: `Aguarde ${gerado.segundos} segundos para pedir outro código.` });
  }
  const envio = await evolutionService.sendMessage(
    numero,
    `ClimaAgro: seu código de confirmação é ${gerado.codigo}. Ele vale por 10 minutos. Se não foi você, ignore esta mensagem.`
  );
  if (!envio.sent) {
    whatsappVerification.cancelarCodigo(req.clerkUserId);
    return res.status(503).json({
      message: 'Não foi possível enviar o código pelo WhatsApp agora. Tente novamente mais tarde.',
    });
  }
  return res.json({ success: true, message: 'Código enviado para o seu WhatsApp.' });
});

// POST /api/agronomos-parceiros/whatsapp/confirmar — confere o código digitado
router.post('/whatsapp/confirmar', clerkAuth, async (req, res) => {
  const r = whatsappVerification.confirmarCodigo(req.clerkUserId, req.body?.codigo);
  if (r.ok) return res.json({ success: true, whatsapp: r.numero });
  const mensagens = {
    sem_codigo: 'Peça um código primeiro.',
    expirado: 'O código expirou. Peça um novo.',
    tentativas: 'Muitas tentativas erradas. Peça um novo código.',
    invalido: `Código incorreto. Restam ${r.restantes} tentativa${r.restantes === 1 ? '' : 's'}.`,
  };
  return res.status(400).json({ message: mensagens[r.motivo] });
});

// POST /api/agronomos-parceiros/cadastro — cria ou atualiza o cadastro de quem está logado
router.post('/cadastro', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.clerkUserId;
    const nome = String(req.body?.nome || '').trim();
    const especialidade = String(req.body?.especialidade || '').trim();
    const whatsapp = onlyDigits(req.body?.whatsapp);
    const telefone = String(req.body?.telefone || '').trim();
    const municipio = String(req.body?.municipio || '').trim();
    const uf = String(req.body?.uf || '').trim().toUpperCase();
    const crea = String(req.body?.crea || '').trim();
    const cpfDigits = onlyDigits(req.body?.cpf);

    if (!nome || !especialidade || !whatsapp || !crea) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, CREA, especialidade e WhatsApp.' });
    }
    if (!cpfDigits || cpfDigits.length !== 11 || !isValidCpf11(cpfDigits)) {
      return res.status(400).json({
        message: 'CPF inválido. Informe os 11 dígitos com dígitos verificadores corretos.',
      });
    }

    const atual = await DualUserProfile.findOne({ where: { clerkUserId } });

    // O WhatsApp precisa ter sido confirmado por código (agora ou em um cadastro anterior).
    const confirmadoAgora = whatsappVerification.numeroConfirmado(clerkUserId) === whatsapp;
    const confirmadoAntes = Boolean(atual?.whatsappVerificadoEm) && onlyDigits(atual?.whatsapp) === whatsapp;
    if (!confirmadoAgora && !confirmadoAntes) {
      return res.status(400).json({ message: 'Confirme o seu WhatsApp com o código antes de salvar.' });
    }

    const email = await emailDaConta(clerkUserId, req.body?.email);
    if (!email) {
      return res.status(400).json({ message: 'Não foi possível identificar o e-mail da sua conta.' });
    }
    const outroComEmail = await DualUserProfile.findOne({
      where: { email, clerkUserId: { [Op.ne]: clerkUserId } },
    });
    if (outroComEmail) {
      return res.status(409).json({ message: 'Este e-mail já está ligado a outro cadastro. Fale com a equipe ClimaAgro.' });
    }

    const dados = {
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
      whatsapp,
      whatsappVerificadoEm: confirmadoAgora ? new Date() : atual.whatsappVerificadoEm,
    };

    let created = false;
    if (!atual) {
      await DualUserProfile.create({ clerkUserId, ...dados, parceiroAtivo: false });
      created = true;
    } else {
      // Primeiro cadastro como parceiro, ou troca de CREA, volta para análise.
      const precisaAnalise = !atual.parceiro || String(atual.crea || '').trim() !== crea;
      await atual.update({ ...dados, ...(precisaAnalise ? { parceiroAtivo: false } : {}) });
      created = !atual.parceiro;
    }
    if (confirmadoAgora) whatsappVerification.consumirConfirmacao(clerkUserId);

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? 'Cadastro recebido! Seu perfil passará por análise antes de aparecer na plataforma.'
        : 'Cadastro atualizado.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Falha ao cadastrar agrônomo parceiro.' });
  }
});

module.exports = router;
