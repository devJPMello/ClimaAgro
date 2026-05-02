const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const UPLOAD_SUBDIR = 'hybrid-media';
const projectRoot = path.join(__dirname, '../..');
const uploadAbsRoot = path.join(projectRoot, 'uploads');

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

/**
 * @returns {Promise<string>} storage key relativo (ex.: hybrid-media/uuid.jpg)
 */
async function saveBuffer(buffer, mimeType) {
  await fs.mkdir(path.join(uploadAbsRoot, UPLOAD_SUBDIR), { recursive: true });
  const id = crypto.randomUUID();
  const ext = extFromMime(mimeType);
  const fname = `${id}.${ext}`;
  const relativeKey = `${UPLOAD_SUBDIR}/${fname}`;
  await fs.writeFile(path.join(uploadAbsRoot, UPLOAD_SUBDIR, fname), buffer);
  return relativeKey;
}

async function readStoredFile(storageKey) {
  const safe = String(storageKey || '').replace(/\.\./g, '').replace(/^\/+/, '');
  if (!safe.startsWith(`${UPLOAD_SUBDIR}/`)) {
    throw new Error('invalid_storage_key');
  }
  const full = path.join(uploadAbsRoot, safe);
  return fs.readFile(full);
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
  fetchRemoteToBuffer,
  uploadAbsRoot,
  UPLOAD_SUBDIR,
  extFromMime,
};
