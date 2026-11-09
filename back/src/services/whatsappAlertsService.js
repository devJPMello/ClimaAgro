const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { normalizeUf } = require('../utils/brazilUfs');
const alertSvc = require('./climateAlertsUiService');
const evolutionService = require('./evolutionService');

const MAX_USUARIOS_POR_RODADA = Number(process.env.WHATSAPP_ALERTS_MAX_USERS || 200);
const MAX_ALERTAS_POR_MENSAGEM = 5;
const PAUSA_ENTRE_ENVIOS_MS = Number(process.env.WHATSAPP_ALERTS_DELAY_MS || 1500);
const JANELA_DIAS = Number(process.env.WHATSAPP_ALERTS_DAYS || 2);
const SEVERIDADES = new Set(['critical', 'high']);
const NOME_SEVERIDADE = { critical: 'crítico', high: 'alto' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function linkAlertas() {
  const base = String(process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
  return base ? `${base}/alertas` : '';
}

/** Texto curto: até 5 alertas, com tipo, severidade e vigência. */
function montarMensagem(uf, alertas) {
  const linhas = alertas.slice(0, MAX_ALERTAS_POR_MENSAGEM).map((a) => {
    const vig = String(a.limiar || '').replace(/^Vigência:\s*/i, '');
    return `• ${a.tipo} (${NOME_SEVERIDADE[a.severidade] || a.severidade})${vig ? ` — ${vig}` : ''}`;
  });
  const partes = [`⚠️ ClimaAgro — alertas de severidade alta em ${uf}`, '', ...linhas];
  if (alertas.length > MAX_ALERTAS_POR_MENSAGEM) {
    partes.push(`… e mais ${alertas.length - MAX_ALERTAS_POR_MENSAGEM} alerta(s).`);
  }
  const link = linkAlertas();
  if (link) partes.push('', `Detalhes: ${link}`);
  partes.push('', 'Para parar de receber, desative "Alertas críticos" em Perfil → Notificações.');
  return partes.join('\n');
}

/** Alertas oficiais recentes de severidade alta/crítica para uma UF. */
async function alertasDaUf(models, uf) {
  const { OfficialAlert, GeoData } = models;
  const rows = await alertSvc.loadOfficialAlertsForUi({ OfficialAlert, days: JANELA_DIAS });
  const itens = await alertSvc.buildOfficialAlertUiItems(rows, uf, null, GeoData);
  return itens.filter((i) => SEVERIDADES.has(i.severidade));
}

async function jaEnviados(userId, ids) {
  if (!ids.length) return new Set();
  const [rows] = await sequelize.query(
    'SELECT alerta_id FROM whatsapp_alertas_enviados WHERE user_id = :userId AND alerta_id IN (:ids)',
    { replacements: { userId, ids } }
  );
  return new Set(rows.map((r) => r.alerta_id));
}

async function registrarEnvio(userId, ids) {
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(
      'INSERT INTO whatsapp_alertas_enviados (user_id, alerta_id) VALUES (:userId, :id) ON CONFLICT DO NOTHING',
      { replacements: { userId, id } }
    );
  }
}

/**
 * Envia por WhatsApp os alertas oficiais novos (severidade alta/crítica) aos usuários que ligaram
 * "Alertas críticos" no Perfil e têm o número confirmado. Cada alerta é enviado uma única vez por usuário.
 * Se o WhatsApp estiver fora do ar, a rodada é interrompida e nada é marcado como enviado.
 */
async function notificarAlertasCriticos({ models }) {
  const resumo = { usuarios: 0, mensagens: 0, alertas: 0, interrompido: false };
  if (!evolutionService.isConfigured()) return { ...resumo, motivo: 'whatsapp_nao_configurado' };

  const perfis = await models.DualUserProfile.findAll({
    where: {
      notifAlertasCriticos: true,
      whatsapp: { [Op.ne]: null },
      whatsappVerificadoEm: { [Op.ne]: null },
      uf: { [Op.ne]: null },
    },
    attributes: ['clerkUserId', 'whatsapp', 'uf'],
    limit: MAX_USUARIOS_POR_RODADA,
  });

  const cacheUf = new Map();
  for (const perfil of perfis) {
    const uf = normalizeUf(perfil.uf);
    if (!uf) continue;
    resumo.usuarios += 1;
    if (!cacheUf.has(uf)) cacheUf.set(uf, await alertasDaUf(models, uf));
    const todos = cacheUf.get(uf);
    if (!todos.length) continue;

    const enviados = await jaEnviados(perfil.clerkUserId, todos.map((a) => String(a.id)));
    const novos = todos.filter((a) => !enviados.has(String(a.id)));
    if (!novos.length) continue;

    const envio = await evolutionService.sendMessage(perfil.whatsapp, montarMensagem(uf, novos));
    if (!envio.sent) {
      resumo.interrompido = true;
      resumo.motivo = envio.reason || 'falha_envio';
      break;
    }
    await registrarEnvio(perfil.clerkUserId, novos.map((a) => String(a.id)));
    resumo.mensagens += 1;
    resumo.alertas += novos.length;
    await sleep(PAUSA_ENTRE_ENVIOS_MS);
  }
  return resumo;
}

module.exports = { notificarAlertasCriticos, _internos: { montarMensagem } };
