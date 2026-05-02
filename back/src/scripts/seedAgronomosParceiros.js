const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DualUserProfile = require('../models/DualUserProfile');

const agronomosSeed = [
  {
    clerkUserId: 'seed-agro-pragas',
    nome: 'Dr. Ricardo Mendes',
    email: 'ricardo.pragas@climaagro.seed',
    telefone: '(63) 98444-3322',
    municipio: 'Palmas',
    uf: 'TO',
    especialidade: 'Pragas',
    crea: 'CREA-TO 99887',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5563984443322',
  },
  {
    clerkUserId: 'seed-agro-1',
    nome: 'Dr. Carlos Oliveira',
    email: 'carlos.mendes@agro.com',
    telefone: '(16) 99876-5432',
    municipio: 'Palmas',
    uf: 'TO',
    especialidade: 'Soja e Milho',
    crea: 'CREA-TO 12345',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5516998765432',
  },
  {
    clerkUserId: 'seed-agro-2',
    nome: 'Dra. Ana Paula Santos',
    email: 'ana.costa@agroconsult.com',
    telefone: '(66) 98765-4321',
    municipio: 'Goiânia',
    uf: 'GO',
    especialidade: 'Horticultura',
    crea: 'CREA-GO 54321',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5566987654321',
  },
  {
    clerkUserId: 'seed-agro-3',
    nome: 'Eng. Agr. Roberto Lima',
    email: 'roberto.silva@agrotech.com',
    telefone: '(62) 99123-4567',
    municipio: 'Cuiabá',
    uf: 'MT',
    especialidade: 'Café e Frutas',
    crea: 'CREA-MT 98765',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5562991234567',
  },
  {
    clerkUserId: 'seed-agro-4',
    nome: 'Dra. Mariana Oliveira',
    email: 'mariana.oliveira@consultagro.com',
    telefone: '(44) 98888-7777',
    municipio: 'Maringá',
    uf: 'PR',
    especialidade: 'Solos e Nutrição de Plantas',
    crea: 'CREA-PR 901234',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5544988887777',
  },
  {
    clerkUserId: 'seed-agro-5',
    nome: 'Dr. Fernando Santos',
    email: 'fernando.santos@fitosanidade.com',
    telefone: '(34) 99555-6666',
    municipio: 'Uberaba',
    uf: 'MG',
    especialidade: 'Fitossanidade',
    crea: 'CREA-MG 567890',
    parceiro: true,
    parceiroAtivo: true,
    whatsapp: '5534995556666',
  },
];

async function seedAgronomosParceiros() {
  console.log('🌱 Iniciando seed de agrônomos parceiros...');

  for (const item of agronomosSeed) {
    const existing = await DualUserProfile.findOne({ where: { email: item.email } });
    if (existing) {
      await existing.update({
        ...item,
        tipo: 'agronomo',
      });
      console.log(`♻️  Atualizado: ${item.nome}`);
    } else {
      await DualUserProfile.create({
        ...item,
        tipo: 'agronomo',
      });
      console.log(`✅ Criado: ${item.nome}`);
    }
  }

  console.log(`🎉 Seed concluído: ${agronomosSeed.length} registros processados.`);
}

if (require.main === module) {
  seedAgronomosParceiros()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Erro ao executar seed de agrônomos parceiros:', error);
      process.exit(1);
    });
}

module.exports = seedAgronomosParceiros;
