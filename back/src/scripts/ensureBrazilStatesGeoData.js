const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../config/database');
const GeoData = require('../models/GeoData');

const STATES = [
  { uf: 'AC', name: 'Acre', region: 'Norte', ibgeCode: '12', lon: -67.8249, lat: -9.9747 },
  { uf: 'AL', name: 'Alagoas', region: 'Nordeste', ibgeCode: '27', lon: -35.7353, lat: -9.6498 },
  { uf: 'AP', name: 'Amapá', region: 'Norte', ibgeCode: '16', lon: -51.0705, lat: 0.0349 },
  { uf: 'AM', name: 'Amazonas', region: 'Norte', ibgeCode: '13', lon: -60.0217, lat: -3.1190 },
  { uf: 'BA', name: 'Bahia', region: 'Nordeste', ibgeCode: '29', lon: -38.5014, lat: -12.9730 },
  { uf: 'CE', name: 'Ceará', region: 'Nordeste', ibgeCode: '23', lon: -38.5434, lat: -3.7172 },
  { uf: 'DF', name: 'Distrito Federal', region: 'Centro-Oeste', ibgeCode: '53', lon: -47.8822, lat: -15.7942 },
  { uf: 'ES', name: 'Espírito Santo', region: 'Sudeste', ibgeCode: '32', lon: -40.3378, lat: -20.3155 },
  { uf: 'GO', name: 'Goiás', region: 'Centro-Oeste', ibgeCode: '52', lon: -49.2539, lat: -16.6869 },
  { uf: 'MA', name: 'Maranhão', region: 'Nordeste', ibgeCode: '21', lon: -44.3028, lat: -2.5307 },
  { uf: 'MT', name: 'Mato Grosso', region: 'Centro-Oeste', ibgeCode: '51', lon: -56.0979, lat: -15.5989 },
  { uf: 'MS', name: 'Mato Grosso do Sul', region: 'Centro-Oeste', ibgeCode: '50', lon: -54.6201, lat: -20.4697 },
  { uf: 'MG', name: 'Minas Gerais', region: 'Sudeste', ibgeCode: '31', lon: -43.9378, lat: -19.9167 },
  { uf: 'PA', name: 'Pará', region: 'Norte', ibgeCode: '15', lon: -48.5039, lat: -1.4558 },
  { uf: 'PB', name: 'Paraíba', region: 'Nordeste', ibgeCode: '25', lon: -34.8631, lat: -7.1153 },
  { uf: 'PR', name: 'Paraná', region: 'Sul', ibgeCode: '41', lon: -49.2733, lat: -25.4284 },
  { uf: 'PE', name: 'Pernambuco', region: 'Nordeste', ibgeCode: '26', lon: -34.8770, lat: -8.0476 },
  { uf: 'PI', name: 'Piauí', region: 'Nordeste', ibgeCode: '22', lon: -42.8034, lat: -5.0892 },
  { uf: 'RJ', name: 'Rio de Janeiro', region: 'Sudeste', ibgeCode: '33', lon: -43.1729, lat: -22.9068 },
  { uf: 'RN', name: 'Rio Grande do Norte', region: 'Nordeste', ibgeCode: '24', lon: -35.2110, lat: -5.7945 },
  { uf: 'RS', name: 'Rio Grande do Sul', region: 'Sul', ibgeCode: '43', lon: -51.2300, lat: -30.0331 },
  { uf: 'RO', name: 'Rondônia', region: 'Norte', ibgeCode: '11', lon: -63.9039, lat: -8.7608 },
  { uf: 'RR', name: 'Roraima', region: 'Norte', ibgeCode: '14', lon: -60.6753, lat: 2.8235 },
  { uf: 'SC', name: 'Santa Catarina', region: 'Sul', ibgeCode: '42', lon: -48.5480, lat: -27.5954 },
  { uf: 'SP', name: 'São Paulo', region: 'Sudeste', ibgeCode: '35', lon: -46.6333, lat: -23.5505 },
  { uf: 'SE', name: 'Sergipe', region: 'Nordeste', ibgeCode: '28', lon: -37.0731, lat: -10.9472 },
  { uf: 'TO', name: 'Tocantins', region: 'Norte', ibgeCode: '17', lon: -48.3336, lat: -10.1840 }
];

async function ensureBrazilStatesGeoData() {
  let created = 0;
  let updated = 0;

  for (const s of STATES) {
    const [row, wasCreated] = await GeoData.findOrCreate({
      where: { category: 'state', state: s.uf },
      defaults: {
        layerName: 'estados_brasil',
        geometryType: 'Point',
        category: 'state',
        name: s.name,
        state: s.uf,
        region: s.region,
        adminLevel: 2,
        ibgeCode: s.ibgeCode,
        isActive: true,
        properties: {
          codigo: s.ibgeCode,
          sigla: s.uf,
          nome: s.name
        },
        geom: {
          type: 'Point',
          coordinates: [s.lon, s.lat]
        }
      }
    });

    if (wasCreated) {
      created += 1;
      continue;
    }

    await row.update({
      layerName: 'estados_brasil',
      geometryType: 'Point',
      name: s.name,
      region: s.region,
      adminLevel: 2,
      ibgeCode: s.ibgeCode,
      isActive: true,
      properties: {
        ...(row.properties || {}),
        codigo: s.ibgeCode,
        sigla: s.uf,
        nome: s.name
      },
      geom: {
        type: 'Point',
        coordinates: [s.lon, s.lat]
      }
    });
    updated += 1;
  }

  const total = await GeoData.count({ where: { category: 'state', isActive: true } });
  return { created, updated, total };
}

(async () => {
  try {
    const result = await ensureBrazilStatesGeoData();
    console.log(`✅ Estados garantidos no geo_data. created=${result.created} updated=${result.updated} total=${result.total}`);
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha ao garantir estados no geo_data:', error.message || error);
    try {
      await sequelize.close();
    } catch {}
    process.exit(1);
  }
})();
