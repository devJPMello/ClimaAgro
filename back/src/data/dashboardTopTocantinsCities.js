/**
 * Cinco municípios do TO com maior população (IBGE, valores em `tocantinsCitiesCptec`)
 * para o resumo do dashboard — nomes devem coincidir com `geo_data.name`.
 */
const cities = require('./tocantinsCitiesCptec');

module.exports = [...cities].sort((a, b) => b.populacao - a.populacao).slice(0, 5);
