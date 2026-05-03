const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { extFromMime } = require('./hybridMediaStorage');

const CREA_SUBDIR = 'crea-documents';
const projectRoot = path.join(__dirname, '../..');
const uploadAbsRoot = path.join(projectRoot, 'uploads');

/**
 * @returns {Promise<string>} storage key relativo (ex.: crea-documents/uuid.jpg)
 */
async function saveCreaDocument(buffer, mimeType) {
  await fs.mkdir(path.join(uploadAbsRoot, CREA_SUBDIR), { recursive: true });
  const id = crypto.randomUUID();
  const ext = extFromMime(mimeType);
  const fname = `${id}.${ext}`;
  const relativeKey = `${CREA_SUBDIR}/${fname}`;
  await fs.writeFile(path.join(uploadAbsRoot, CREA_SUBDIR, fname), buffer);
  return relativeKey;
}

module.exports = {
  saveCreaDocument,
  CREA_SUBDIR,
};
