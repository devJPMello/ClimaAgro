const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { clerkAuth } = require('../middleware/clerkAuth');
const { models } = require('../config/database');
const evolutionService = require('../services/evolutionService');
const whatsappVerification = require('../services/whatsappVerification');

const router = express.Router();
router.use(clerkAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 8 * 1024 * 1024 } });

const codigoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `whatsapp-codigo:${req.clerkUserId}`,
  message: { message: 'Muitos pedidos de código. Tente de novo em alguns minutos.' },
});

const relatorioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `whatsapp-relatorio:${req.clerkUserId}`,
  message: { message: 'Muitos envios seguidos. Aguarde um minuto.' },
});

const TIPOS_RELATORIO = {
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function mascarar(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  return d.length >= 4 ? `••••••${d.slice(-4)}` : null;
}

async function perfilDoUsuario(clerkUserId) {
  return models.DualUserProfile.findOne({ where: { clerkUserId } });
}

// GET /api/whatsapp/status — situação do número do usuário
router.get('/status', async (req, res) => {
  try {
    const perfil = await perfilDoUsuario(req.clerkUserId);
    return res.json({
      disponivel: evolutionService.isConfigured(),
      numero: perfil?.whatsapp ? mascarar(perfil.whatsapp) : null,
      verificado: Boolean(perfil?.whatsapp && perfil?.whatsappVerificadoEm),
      alertasCriticos: Boolean(perfil?.notifAlertasCriticos),
    });
  } catch (e) {
    console.error('whatsapp/status:', e.message);
    return res.status(500).json({ message: 'Falha ao consultar o WhatsApp.' });
  }
});

// POST /api/whatsapp/codigo — envia o código de confirmação para o número informado
router.post('/codigo', codigoLimiter, async (req, res) => {
  const numero = whatsappVerification.normalizarNumero(req.body?.whatsapp);
  if (!whatsappVerification.numeroValido(numero)) {
    return res.status(400).json({ message: 'WhatsApp inválido. Use DDD + número (ex.: 63999999999).' });
  }
  try {
    const perfil = await perfilDoUsuario(req.clerkUserId);
    if (!perfil) {
      return res.status(404).json({ message: 'Salve o seu perfil antes de cadastrar o WhatsApp.' });
    }
    const gerado = await whatsappVerification.gerarCodigo(req.clerkUserId, numero);
    if (!gerado.ok) {
      return res.status(429).json({ message: `Aguarde ${gerado.segundos} segundos para pedir outro código.` });
    }
    const envio = await evolutionService.sendMessage(
      numero,
      `ClimaAgro: seu código de confirmação é ${gerado.codigo}. Ele vale por 10 minutos. Se não foi você, ignore esta mensagem.`
    );
    if (!envio.sent) {
      await whatsappVerification.cancelarCodigo(req.clerkUserId);
      return res.status(503).json({
        message: 'Não foi possível enviar o código pelo WhatsApp agora. Tente novamente mais tarde.',
      });
    }
    return res.json({ success: true, message: 'Código enviado para o seu WhatsApp.' });
  } catch (e) {
    console.error('whatsapp/codigo:', e.message);
    return res.status(500).json({ message: 'Falha ao gerar o código. Tente novamente.' });
  }
});

// POST /api/whatsapp/confirmar — confere o código e grava o número no perfil
router.post('/confirmar', async (req, res) => {
  try {
    const r = await whatsappVerification.confirmarCodigo(req.clerkUserId, req.body?.codigo);
    if (!r.ok) {
      const mensagens = {
        sem_codigo: 'Peça um código primeiro.',
        expirado: 'O código expirou. Peça um novo.',
        tentativas: 'Muitas tentativas erradas. Peça um novo código.',
        invalido: `Código incorreto. Restam ${r.restantes} tentativa${r.restantes === 1 ? '' : 's'}.`,
      };
      return res.status(400).json({ message: mensagens[r.motivo] });
    }
    const perfil = await perfilDoUsuario(req.clerkUserId);
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil não encontrado.' });
    }
    await perfil.update({ whatsapp: r.numero, whatsappVerificadoEm: new Date() });
    await whatsappVerification.consumirConfirmacao(req.clerkUserId);
    return res.json({ success: true, numero: mascarar(r.numero) });
  } catch (e) {
    console.error('whatsapp/confirmar:', e.message);
    return res.status(500).json({ message: 'Falha ao conferir o código. Tente novamente.' });
  }
});

// DELETE /api/whatsapp — remove o número (e, com isso, os alertas por WhatsApp)
router.delete('/', async (req, res) => {
  try {
    const perfil = await perfilDoUsuario(req.clerkUserId);
    if (!perfil) return res.status(404).json({ message: 'Perfil não encontrado.' });
    await perfil.update({ whatsapp: null, whatsappVerificadoEm: null });
    return res.json({ success: true });
  } catch (e) {
    console.error('whatsapp/remover:', e.message);
    return res.status(500).json({ message: 'Falha ao remover o número.' });
  }
});

// POST /api/whatsapp/relatorio — envia um relatório já gerado (PDF/CSV/Excel) ao número confirmado
router.post('/relatorio', relatorioLimiter, upload.single('file'), async (req, res) => {
  try {
    const arquivo = req.file;
    if (!arquivo) return res.status(400).json({ message: 'Envie o arquivo do relatório.' });
    const ext = TIPOS_RELATORIO[String(arquivo.mimetype || '').toLowerCase()];
    if (!ext) return res.status(400).json({ message: 'Formato não suportado. Use PDF, CSV ou Excel.' });

    const perfil = await perfilDoUsuario(req.clerkUserId);
    if (!perfil?.whatsapp || !perfil.whatsappVerificadoEm) {
      return res.status(400).json({ message: 'Confirme o seu WhatsApp no Perfil antes de enviar relatórios.' });
    }

    const titulo = String(req.body?.titulo || 'Relatório').trim().slice(0, 120) || 'Relatório';
    const nomeArquivo = String(req.body?.nomeArquivo || `relatorio-climaagro.${ext}`)
      .replace(/[^\w.\-() ]+/g, '_')
      .slice(0, 100);
    const envio = await evolutionService.sendMedia(
      perfil.whatsapp,
      `📄 ClimaAgro — ${titulo}`,
      arquivo.buffer,
      arquivo.mimetype,
      { fileName: nomeArquivo }
    );
    if (!envio.sent) {
      return res.status(503).json({ message: 'Não foi possível enviar pelo WhatsApp agora. Tente novamente mais tarde.' });
    }
    return res.json({ success: true, message: 'Relatório enviado para o seu WhatsApp.' });
  } catch (e) {
    console.error('whatsapp/relatorio:', e.message);
    return res.status(500).json({ message: 'Falha ao enviar o relatório.' });
  }
});

module.exports = router;
