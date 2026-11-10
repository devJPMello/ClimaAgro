const express = require('express');
const multer = require('multer');
const { clerkAuth } = require('../middleware/clerkAuth');
const diario = require('../services/diarioService');
const { saveBuffer, readStoredFile, deleteStoredFile } = require('../services/iagroMediaStorage');

const router = express.Router();
router.use(clerkAuth);

const MAX_ANEXOS = 3;
const TIPOS_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_ANEXOS, fileSize: 5 * 1024 * 1024 },
}).array('files', MAX_ANEXOS);

function receberArquivos(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const mensagem =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Cada foto pode ter no máximo 5 MB.'
        : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
          ? `Envie no máximo ${MAX_ANEXOS} fotos por registro.`
          : 'Não foi possível ler as fotos enviadas.';
    return res.status(400).json({ message: mensagem });
  });
}

// GET /api/diario — registros do usuário, do mais recente para o mais antigo
router.get('/', async (req, res) => {
  try {
    const registros = await diario.listar(req.clerkUserId);
    return res.json({ registros });
  } catch (e) {
    console.error('diario GET /:', e.message);
    return res.status(500).json({ message: 'Falha ao carregar o diário.' });
  }
});

// POST /api/diario — novo registro (multipart: campos + até 3 fotos)
router.post('/', receberArquivos, async (req, res) => {
  const guardadas = [];
  try {
    const { erro, valor } = diario.validarEntrada(req.body);
    if (erro) return res.status(400).json({ message: erro });

    const arquivos = req.files || [];
    if (arquivos.some((f) => !TIPOS_IMAGEM.has(f.mimetype))) {
      return res.status(400).json({ message: 'Envie apenas fotos (JPG, PNG ou WebP).' });
    }
    if ((await diario.contar(req.clerkUserId)) >= diario.MAX_REGISTROS_POR_USUARIO) {
      return res.status(400).json({ message: 'Limite de registros atingido. Apague registros antigos para continuar.' });
    }

    for (const f of arquivos) {
      // eslint-disable-next-line no-await-in-loop
      const key = await saveBuffer(f.buffer, f.mimetype);
      guardadas.push({ key, mime: f.mimetype, name: String(f.originalname || 'foto').slice(0, 120) });
    }
    const id = await diario.criar(req.clerkUserId, valor, guardadas);
    return res.status(201).json({ id });
  } catch (e) {
    await Promise.all(guardadas.map((a) => deleteStoredFile(a.key)));
    console.error('diario POST /:', e.message);
    return res.status(500).json({ message: 'Falha ao salvar o registro.' });
  }
});

// DELETE /api/diario/:id — apaga o registro e as fotos
router.delete('/:id', async (req, res) => {
  try {
    const anexos = await diario.remover(req.clerkUserId, String(req.params.id));
    if (!anexos) return res.status(404).json({ message: 'Registro não encontrado.' });
    await Promise.all(anexos.map((a) => deleteStoredFile(a.key)));
    return res.json({ success: true });
  } catch (e) {
    console.error('diario DELETE /:id:', e.message);
    return res.status(500).json({ message: 'Falha ao apagar o registro.' });
  }
});

// GET /api/diario/:id/anexo/:index — foto do registro (somente o dono)
router.get('/:id/anexo/:index', async (req, res) => {
  try {
    const registro = await diario.buscarBruto(req.clerkUserId, String(req.params.id));
    const anexos = Array.isArray(registro?.attachments) ? registro.attachments : [];
    const anexo = anexos[Number.parseInt(String(req.params.index), 10)];
    if (!anexo?.key) return res.status(404).json({ message: 'Foto não encontrada.' });
    let dados;
    try {
      dados = await readStoredFile(anexo.key);
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ message: 'Esta foto não está mais disponível.' });
      throw err;
    }
    res.setHeader('Content-Type', anexo.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(dados);
  } catch (e) {
    console.error('diario GET anexo:', e.message);
    return res.status(500).json({ message: 'Falha ao ler a foto.' });
  }
});

// GET /api/diario/:id/clima — clima do estado na semana anterior e posterior ao registro
router.get('/:id/clima', async (req, res) => {
  try {
    const registro = await diario.buscarBruto(req.clerkUserId, String(req.params.id));
    if (!registro) return res.status(404).json({ message: 'Registro não encontrado.' });
    const clima = await diario.contextoClimatico(registro.uf, registro.data);
    return res.json({ uf: registro.uf, data: registro.data, ...clima });
  } catch (e) {
    console.error('diario GET clima:', e.message);
    return res.status(500).json({ message: 'Falha ao consultar o clima do registro.' });
  }
});

module.exports = router;
