const { Op, fn, col } = require('sequelize');
const { models, sequelize } = require('../config/database');
const { normalizeUf } = require('../utils/brazilUfs');
const alertSvc = require('./climateAlertsUiService');

const MAX_CHARS = 4000;
const OFFICIAL_DAYS = () => Number(process.env.IAGRO_OFFICIAL_ALERTS_DAYS || 7);
const MAX_OFFICIAL_LINES = () => Number(process.env.IAGRO_OFFICIAL_ALERTS_MAX || 8);

const MAX_CULTURAS = () => Number(process.env.IAGRO_MAX_CULTURAS || 6);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-09" -> "set/2026". */
function mesAno(periodo) {
  const m = /^(\d{4})-(\d{2})/.exec(String(periodo || ''));
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : String(periodo || '—');
}

/** "1.17 soja" -> "Soja"; "12 castanha-de-caju" -> "Castanha-de-caju". */
function nomeCultura(rotulo) {
  const s = String(rotulo || '').replace(/^[\d.]+\s*/, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

/**
 * Principais culturas da UF: para cada produto, a estimativa mais recente com
 * produtividade > 0; ordena pela área plantada nessa estimativa.
 */
async function principaisCulturasDoEstado(uf) {
  const rows = await sequelize.query(
    `WITH ultima AS (
       SELECT DISTINCT ON (product_label)
              product_label, period_ref, productivity, planted_area
         FROM productivity
        WHERE state = :uf AND productivity > 0 AND period_ref IS NOT NULL
          -- Totais do IBGE (não são culturas): "1 cereais, leguminosas e oleaginosas" e "9/10 café total".
          AND product_label NOT ILIKE '%cereais, leguminosas%'
          AND product_label NOT ILIKE '%total%'
        ORDER BY product_label, period_ref DESC
     )
     SELECT product_label, period_ref, productivity, planted_area
       FROM ultima
      ORDER BY planted_area DESC NULLS LAST, product_label
      LIMIT :limite`,
    { replacements: { uf, limite: MAX_CULTURAS() }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    nome: nomeCultura(r.product_label),
    produtividade: Number(r.productivity),
    periodo: r.period_ref,
  }));
}

const ORDEM_SEVERIDADE = { critical: 4, high: 3, medium: 2, low: 1 };
const NOME_SEVERIDADE = { critical: 'crítica', high: 'alta', medium: 'média', low: 'baixa' };

/** "08/11/2026" -> 20261108 (para ordenar). */
function chaveData(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d || ''));
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}

/** Junta alertas do mesmo tipo em uma linha: quantidade, período e severidade máxima. */
function agruparAlertas(itens) {
  const grupos = new Map();
  for (const it of itens) {
    const tipo = String(it.tipo || 'Alerta');
    const g = grupos.get(tipo) || { tipo, total: 0, datas: [], severidade: 'low', exemplo: it };
    g.total += 1;
    if (it.data) g.datas.push(it.data);
    if ((ORDEM_SEVERIDADE[it.severidade] || 0) > (ORDEM_SEVERIDADE[g.severidade] || 0)) {
      g.severidade = it.severidade;
      g.exemplo = it;
    }
    grupos.set(tipo, g);
  }
  return [...grupos.values()]
    .sort((a, b) => (ORDEM_SEVERIDADE[b.severidade] || 0) - (ORDEM_SEVERIDADE[a.severidade] || 0) || b.total - a.total)
    .map((g) => {
      const datas = g.datas.filter((d) => chaveData(d) > 0).sort((x, y) => chaveData(x) - chaveData(y));
      const periodo =
        datas.length === 0
          ? ''
          : datas[0] === datas[datas.length - 1]
            ? datas[0]
            : `${datas[0].slice(0, 5)} a ${datas[datas.length - 1].slice(0, 5)}`;
      const resumo = String(g.exemplo.valorAtual || g.exemplo.recomendacao || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      const qtd = g.total > 1 ? `${g.total} avisos` : '1 aviso';
      const sev = NOME_SEVERIDADE[g.severidade] ? `, severidade máxima ${NOME_SEVERIDADE[g.severidade]}` : '';
      return `- ${g.tipo} (${qtd}${periodo ? `, ${periodo}` : ''}${sev}): ${resumo}`;
    });
}

function fmtNum(v, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(Number(v).toFixed(digits)).toString();
}

/**
 * Texto curto com dados reais do BD (perfil, clima agregado por UF, produtividade, alertas oficiais)
 * para injetar no prompt do IAgro. Falhas de BD retornam string vazia (chat segue sem bloquear).
 */
async function buildIagroDataContext(clerkUserId) {
  const { DualUserProfile, ClimateData, GeoData, OfficialAlert } = models;
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

    const culturas = await principaisCulturasDoEstado(ufRaw);
    if (culturas.length) {
      const bits = culturas.map(
        (c) => `${c.nome}: ${fmtNum(c.produtividade, 2)} t/ha (estimativa de ${mesAno(c.periodo)})`
      );
      lines.push(
        `Produtividade das principais culturas da UF ${ufRaw} (maior área plantada; estimativas do LSPA/IBGE para a safra do ano, não colheita do mês; dado estadual): ${bits.join('; ')}.`
      );
    } else {
      lines.push(`Sem dados de produtividade no banco para a UF ${ufRaw}.`);
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
        const agrupados = agruparAlertas(unique);
        agrupados.slice(0, maxAlertLines).forEach((linha) => lines.push(linha));
        if (agrupados.length > maxAlertLines) {
          lines.push(`… e mais ${agrupados.length - maxAlertLines} tipo(s) de alerta (lista completa no app).`);
        }
        lines.push(`Total: ${unique.length} alerta(s) oficial(is) no período.`);
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

module.exports = { buildIagroDataContext, _internos: { agruparAlertas, nomeCultura, mesAno } };
