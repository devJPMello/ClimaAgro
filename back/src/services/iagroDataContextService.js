const { Op, fn, col } = require('sequelize');
const { models } = require('../config/database');
const { normalizeUf } = require('../utils/brazilUfs');
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');
const alertSvc = require('./climateAlertsUiService');

const MAX_CHARS = 4000;
const OFFICIAL_DAYS = () => Number(process.env.IAGRO_OFFICIAL_ALERTS_DAYS || 7);
const MAX_OFFICIAL_LINES = () => Number(process.env.IAGRO_OFFICIAL_ALERTS_MAX || 8);

function fmtNum(v, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(Number(v).toFixed(digits)).toString();
}

/**
 * Texto curto com dados reais do BD (perfil, clima agregado por UF, produtividade, alertas oficiais)
 * para injetar no prompt do IAgro. Falhas de BD retornam string vazia (chat segue sem bloquear).
 */
async function buildIagroDataContext(clerkUserId) {
  const { DualUserProfile, ClimateData, GeoData, Productivity, OfficialAlert } = models;
  const cid = String(clerkUserId || '').trim();
  if (!cid) return '';

  try {
    const profile = await DualUserProfile.findOne({
      where: { clerkUserId: cid },
      attributes: ['uf', 'municipio'],
    });

    const lines = [
      '## Dados ClimaAgro (sistema)',
      'Use apenas os números e alertas abaixo como dados internos do app (clima, produtividade, avisos oficiais); não invente métricas nem alertas.',
      '',
    ];

    if (!profile) {
      lines.push(
        'Perfil regional ainda não foi gravado no servidor para este login. Oriente o produtor a abrir a página **Perfil**, preencher **UF** e **Município** (secção Localização) e tocar em **Salvar** — isso sincroniza com o ClimaAgro; preferências antigas só no aparelho não contam. Não invente menus ou campos que não existam na app.'
      );
      return lines.join('\n').slice(0, MAX_CHARS);
    }

    const ufRaw = normalizeUf(profile.uf);
    const munLabel = String(profile.municipio || '').trim();
    const munKey = munLabel ? normalizeMunicipalityKey(munLabel) : null;

    if (!ufRaw) {
      lines.push(
        munLabel
          ? `Cadastro sem UF válida no servidor; município: ${munLabel}. Peça que escolha a UF em Perfil → Localização e salve.`
          : 'Cadastro sem UF válida. Peça que escolha a UF em Perfil → Localização e salve.'
      );
      return lines.join('\n').slice(0, MAX_CHARS);
    }

    lines.push(
      `Referência regional: UF ${ufRaw}${munLabel ? `, município ${munLabel}` : ''}.`
    );

    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const start30 = d30.toISOString().split('T')[0];
    const end = now.toISOString().split('T')[0];

    const geoState = await GeoData.findOne({
      where: { category: 'state', isActive: true, state: ufRaw },
      attributes: ['id', 'name'],
    });

    if (!geoState) {
      lines.push(`Sem malha estadual ativa no banco para UF ${ufRaw}.`);
    } else {
      const [agg] = await ClimateData.findAll({
        attributes: [
          [fn('AVG', col('avg_temperature')), 'avgTemp'],
          [fn('COALESCE', fn('SUM', col('precipitation')), 0), 'sumPrecip'],
          [fn('COUNT', col('id')), 'n'],
        ],
        where: {
          geoDataId: geoState.id,
          date: { [Op.between]: [start30, end] },
        },
        raw: true,
      });
      const nDays = Number(agg?.n || 0);
      if (nDays === 0) {
        lines.push(
          `Clima (${start30} a ${end}, malha ${geoState.name || ufRaw}): sem registros no período.`
        );
      } else {
        lines.push(
          `Clima agregado (${start30} a ${end}, ${nDays} dia(s), malha estadual ${geoState.name || ufRaw}): temperatura média ${fmtNum(
            agg?.avgTemp,
            1
          )} °C; precipitação acumulada ${fmtNum(agg?.sumPrecip, 1)} mm.`
        );
      }
    }

    let latestYear = munKey
      ? await Productivity.max('year', {
          where: { state: ufRaw, municipalityKey: munKey },
        })
      : null;
    if (latestYear == null) {
      latestYear = await Productivity.max('year', { where: { state: ufRaw } });
    }

    if (latestYear != null) {
      const y = Number(latestYear);
      let picks = munKey
        ? await Productivity.findAll({
            where: { state: ufRaw, municipalityKey: munKey, year: y },
            attributes: ['cropType', 'productivity', 'productLabel', 'season'],
            order: [['cropType', 'ASC']],
            limit: 6,
            raw: true,
          })
        : [];
      if (!picks.length) {
        picks = await Productivity.findAll({
          where: { state: ufRaw, year: y },
          attributes: ['cropType', 'productivity', 'productLabel', 'season'],
          order: [['cropType', 'ASC']],
          limit: 6,
          raw: true,
        });
      }
      if (picks.length) {
        const bits = picks.map(
          (r) =>
            `${r.cropType}: ${fmtNum(r.productivity, 2)} t/ha (${String(r.productLabel || '').slice(0, 80)}${r.season ? `, ${r.season}` : ''})`
        );
        lines.push(
          `Produtividade de referência (ano ${y}${munKey ? '; sem dado municipal usa médias estaduais' : ''}): ${bits.join('; ')}.`
        );
      } else {
        lines.push(`Sem linhas de produtividade no banco para o recorte (ano ${y}).`);
      }
    } else {
      lines.push('Sem dados de produtividade municipal/estadual no banco para esta UF.');
    }

    const days = OFFICIAL_DAYS();
    const maxAlertLines = MAX_OFFICIAL_LINES();
    try {
      const officialRows = await alertSvc.loadOfficialAlertsForUi({ OfficialAlert, days });
      const liveNormalized = await alertSvc.fetchLiveOfficialProductsForRead(days);
      const dbExternalIds = new Set(officialRows.map((r) => String(r.externalId || '')));
      const liveOnlyNormalized = liveNormalized.filter((n) => !dbExternalIds.has(n.externalId));

      const officialFromDb = await alertSvc.buildOfficialAlertUiItems(officialRows, ufRaw, null, GeoData);
      const officialFromLive = await alertSvc.buildOfficialAlertUiItems(
        alertSvc.normalizedListToOfficialRowLikes(liveOnlyNormalized),
        ufRaw,
        null,
        GeoData
      );

      const merged = [...officialFromDb, ...officialFromLive];
      const seen = new Set();
      const unique = [];
      for (const it of merged) {
        const id = String(it.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(it);
      }

      lines.push('');
      if (unique.length) {
        lines.push(
          `Alertas meteorológicos oficiais (últimos ${days} dias, UF ${ufRaw}; mesmo recorte da área de alertas do app):`
        );
        for (const it of unique.slice(0, maxAlertLines)) {
          const summary = String(it.valorAtual || it.recomendacao || '—')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200);
          lines.push(`- ${it.data || '—'} · ${it.tipo}: ${summary} (${it.local})`);
        }
        if (unique.length > maxAlertLines) {
          lines.push(`… e mais ${unique.length - maxAlertLines} alerta(s) no período (lista completa no app).`);
        }
      } else {
        lines.push(
          `Alertas meteorológicos oficiais (UF ${ufRaw}, últimos ${days} dias): nenhum vigente no recorte ou sem ingestão recente.`
        );
      }
    } catch (alertErr) {
      console.error('buildIagroDataContext alerts:', alertErr.message);
      lines.push('');
      lines.push('Alertas oficiais: indisponíveis no momento (falha ao montar o recorte).');
    }

    return lines.join('\n').slice(0, MAX_CHARS);
  } catch (e) {
    console.error('buildIagroDataContext:', e.message);
    return '';
  }
}

module.exports = { buildIagroDataContext };
