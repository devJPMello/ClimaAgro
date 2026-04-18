/**
 * Grandes cidades do Tocantins para sync CPTEC (`listaCidades?city=` + previsão 7 dias).
 * `cptecCityQuery`: termo de busca sem acentos (CPTEC); `name` deve coincidir com `geo_data.name` no seed.
 * `metarIcao`: opcional — só Palmas usa METAR estadual documentado no projeto (SBPJ).
 */
module.exports = [
  { name: 'Palmas', cptecCityQuery: 'palmas', metarIcao: 'SBPJ', ibgeCode: '1721000', populacao: 302692 },
  { name: 'Araguaína', cptecCityQuery: 'araguaina', metarIcao: null, ibgeCode: '1702109', populacao: 183381 },
  { name: 'Gurupi', cptecCityQuery: 'gurupi', metarIcao: null, ibgeCode: '1709500', populacao: 90647 },
  { name: 'Porto Nacional', cptecCityQuery: 'porto nacional', metarIcao: null, ibgeCode: '1718204', populacao: 53174 },
  { name: 'Paraíso do Tocantins', cptecCityQuery: 'paraiso do tocantins', metarIcao: null, ibgeCode: '1716109', populacao: 52959 },
  { name: 'Guaraí', cptecCityQuery: 'guarai', metarIcao: null, ibgeCode: '1709302', populacao: 25863 }
];
