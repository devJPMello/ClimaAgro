/**
 * Chave estável para comparar nomes de município (SIDRA vs geo_data / IBGE).
 */
function normalizeMunicipalityKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

module.exports = { normalizeMunicipalityKey };
