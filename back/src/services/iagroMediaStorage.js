const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const UPLOAD_SUBDIR = 'hybrid-media';
const projectRoot = path.join(__dirname, '../..');
const uploadAbsRoot = path.join(projectRoot, 'uploads');

/*
 * Os ficheiros ficam no Postgres (tabela hybrid_media_files), não no disco:
 * no Render gratuito o disco é apagado a cada reinício/deploy e a mídia sumiria.
 * A chave continua no formato "hybrid-media/<uuid>.<ext>" (compatível com registros antigos).
 */

function db() {
  // require tardio: evita ciclo database.js → modelos → serviços.
  return require('../config/database').sequelize;
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('jpeg') || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m.includes('audio/ogg')) return 'ogg';
  if (m.includes('mpeg')) return 'mp3';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}

function chaveSegura(storageKey) {
  const safe = String(storageKey || '').replace(/\.\./g, '').replace(/^\/+/, '');
  return safe.startsWith(`${UPLOAD_SUBDIR}/`) ? safe : null;
}

/**
 * @returns {Promise<string>} storage key relativo (ex.: hybrid-media/uuid.jpg)
 */
async function saveBuffer(buffer, mimeType) {
  const key = `${UPLOAD_SUBDIR}/${crypto.randomUUID()}.${extFromMime(mimeType)}`;
  await db().query(
    'INSERT INTO hybrid_media_files (storage_key, mime_type, data) VALUES (:key, :mime, :data)',
    { replacements: { key, mime: String(mimeType || 'application/octet-stream'), data: buffer } }
  );
  return key;
}

async function readStoredFile(storageKey) {
  const safe = chaveSegura(storageKey);
  if (!safe) throw new Error('invalid_storage_key');

  const [rows] = await db().query('SELECT data FROM hybrid_media_files WHERE storage_key = :key LIMIT 1', {
    replacements: { key: safe },
  });
  if (rows.length && rows[0].data) return Buffer.from(rows[0].data);

  // Registros antigos, gravados em disco antes da mudança.
  return fs.readFile(path.join(uploadAbsRoot, safe));
}

/** Remove ficheiro guardado (ex.: rollback após falha no envio). */
async function deleteStoredFile(storageKey) {
  const safe = chaveSegura(storageKey);
  if (!safe) return;
  try {
    await db().query('DELETE FROM hybrid_media_files WHERE storage_key = :key', { replacements: { key: safe } });
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(path.join(uploadAbsRoot, safe));
  } catch {
    /* ignore */
  }
}

async function fetchRemoteToBuffer(url, options = {}) {
  const { auth } = options;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 90000,
    maxContentLength: 25 * 1024 * 1024,
    ...(auth ? { auth } : {}),
  });
  return Buffer.from(response.data);
}

module.exports = {
  saveBuffer,
  readStoredFile,
  deleteStoredFile,
  fetchRemoteToBuffer,
  uploadAbsRoot,
  UPLOAD_SUBDIR,
  extFromMime,
};
