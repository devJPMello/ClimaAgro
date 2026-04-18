/**
 * Siglas com precipitação (chuva ou possibilidade), conforme tabela oficial CPTEC
 * "Siglas das condições do tempo" em https://servicos.cptec.inpe.br/XML/
 * (não substitui precipitação em mm — o produto municipal de previsão não informa mm por dia).
 */
const RAIN_OR_SHOWER_CODES = new Set([
  'ec',
  'ci',
  'c',
  'pp',
  'cm',
  'cn',
  'pt',
  'pm',
  'np',
  'pc',
  'pnt',
  'psc',
  'pcm',
  'pct',
  'pcn',
  'ncn',
  'nct',
  'ncm',
  'npp',
  'ct'
]);

function isPrecipitationLikelyFromTempoCode(code) {
  if (!code) return false;
  return RAIN_OR_SHOWER_CODES.has(String(code).toLowerCase().trim());
}

module.exports = { RAIN_OR_SHOWER_CODES, isPrecipitationLikelyFromTempoCode };
