/**
 * Alinha rótulos SIDRA ao campo `crop_type` em `productivity`.
 * Culturas principais ficam com chave fixa (soja, milho, …); o resto usa um slug estável
 * derivado do nome do produto (evita tudo virar "outros").
 */
function slugifySidraProductLabel(productLabel) {
  const raw = String(productLabel || '').trim();
  if (!raw || raw.toLowerCase() === 'total') return 'outros';
  const t = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!t) return 'outros';
  return t.slice(0, 80);
}

function mapProductLabelToCropType(productLabel) {
  const s = String(productLabel || '').toLowerCase();
  if (s === 'total' || !s.trim()) return null;
  if (s.includes('soja')) return 'soja';
  if (s.includes('milho')) return 'milho';
  if (s.includes('trigo')) return 'trigo';
  if (s.includes('arroz')) return 'arroz';
  if (s.includes('feijão') || s.includes('feijao')) return 'feijao';
  if (s.includes('algodão') || s.includes('algodao')) return 'algodao';
  if (s.includes('cana')) return 'cana';
  if (s.includes('café') || s.includes('cafe')) return 'cafe';
  return slugifySidraProductLabel(productLabel);
}

module.exports = { mapProductLabelToCropType, slugifySidraProductLabel };
