const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { saveCreaDocument } = require('../services/creaDocumentStorage');
const { extractAndParseCreaFields } = require('../services/creaVisionParse');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CREA_SCAN_RATE_LIMIT_PER_WINDOW || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

router.post('/scan-crea', scanLimiter, upload.single('document'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Envie uma imagem no campo "document" (multipart/form-data).',
      });
    }

    const mime = String(req.file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return res.status(400).json({
        success: false,
        message: 'Formato não suportado. Use JPEG, PNG ou WebP.',
      });
    }

    const storageKey = await saveCreaDocument(req.file.buffer, mime);
    const { extracted, visionError, rawText } = await extractAndParseCreaFields(req.file.buffer);

    const warnings = [];
    if (visionError === 'missing_api_key') {
      warnings.push(
        'OCR não configurado (GOOGLE_CLOUD_VISION_API_KEY). Preencha os dados manualmente.'
      );
    } else if (visionError === 'no_text') {
      warnings.push('Não foi possível ler texto na imagem. Verifique o foco e a iluminação.');
    } else if (visionError) {
      warnings.push(
        `Leitura automática indisponível no momento. Preencha manualmente. (${visionError})`
      );
    }

    return res.json({
      success: true,
      data: {
        storageKey,
        extracted: {
          fullName: extracted.fullName,
          creaRegistrationNumber: extracted.creaRegistrationNumber,
          creaUf: extracted.creaUf,
          cpf: extracted.cpf,
        },
        warnings,
        ...(rawText ? { rawText } : {}),
      },
    });
  } catch (error) {
    console.error('scan-crea error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar a imagem.',
    });
  }
});

module.exports = router;
