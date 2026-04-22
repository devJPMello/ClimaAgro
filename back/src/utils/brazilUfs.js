const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

function normalizeUf(raw) {
  const uf = String(raw || '').trim().toUpperCase();
  if (uf === 'ALL') return 'ALL';
  return BRAZIL_UFS.includes(uf) ? uf : null;
}

module.exports = {
  BRAZIL_UFS,
  normalizeUf
};
