# Dados reais (produção / homologação)

As **seeds** (`seed:geo`, `seed:productivity`) geram **geometrias simplificadas** e **números fictícios** para desenvolvimento. Elas **não** substituem medições oficiais.

## Clima (CPTEC / Open-Meteo) e alertas (INMET)

O backend já implementa ingestão real em `src/services/climateSyncService.js`:

| Fonte | O quê grava | Variáveis de ambiente |
|--------|-------------|------------------------|
| **CPTEC** | **Padrão:** previsão 7 dias por **6 grandes municípios do Tocantins** (Palmas, Araguaína, Gurupi, Porto Nacional, Paraíso do Tocantins, Guaraí) + METAR em Palmas (`SBPJ`). **Opcional:** `CLIMATE_SYNC_SCOPE=brasil` volta ao sync por capital de **todas** as UFs. | `ENABLE_CPTEC_SYNC`, `ENABLE_CPTEC_METAR`, `CPTEC_SYNC_DELAY_MS`, `CLIMATE_SYNC_SCOPE` (`tocantins` \| `brasil`) |
| **Open-Meteo** | Série diária por coordenada (temp média/máx/mín, precipitação mm/dia, umidade, vento, pressão) para os municípios do TO | `ENABLE_OPEN_METEO_SYNC`, `OPEN_METEO_BASE_URL`, `OPEN_METEO_PAST_DAYS`, `OPEN_METEO_FORECAST_DAYS`, `OPEN_METEO_TIMEZONE` |
| **Alertas INMET** | JSON no contrato de `DATA_SOURCES.md` (adapter local RSS/CAP) | `ENABLE_INMET_ALERTS_SYNC`, `INMET_ALERTS_JSON_URL` |

### Como rodar a sincronização

1. Defina no `back/.env` pelo menos o acesso ao Postgres (`DATABASE_URL` / `POSTGRES_URL`).
2. (Opcional) Defina `CLIMATE_SYNC_SECRET` e use o header em `POST /api/climate/sync`, **ou** rode sem expor HTTP:

```bash
cd back
npm run sync:climate
```

3. Confira no banco: `climate_data` com `data_source` = `cptec` ou `outros` (Open-Meteo), e `metadata` com blocos CPTEC/METAR/Open-Meteo.

### Sincronização automática (sem `npm run sync:climate`)

Também é possível deixar o backend sincronizando automaticamente por intervalo (ex.: 12h) ou em horário fixo diário:

```bash
ENABLE_CLIMATE_AUTO_SYNC=true
CLIMATE_AUTO_SYNC_EVERY_HOURS=12
CLIMATE_AUTO_SYNC_HOUR=3
CLIMATE_AUTO_SYNC_MINUTE=0
CLIMATE_AUTO_SYNC_RUN_ON_BOOT=false
```

- `ENABLE_CLIMATE_AUTO_SYNC`: liga/desliga o agendamento.
- `CLIMATE_AUTO_SYNC_EVERY_HOURS`: intervalo em horas. Se `> 0`, tem prioridade sobre o horário diário.
- `CLIMATE_AUTO_SYNC_HOUR` e `CLIMATE_AUTO_SYNC_MINUTE`: usados quando `CLIMATE_AUTO_SYNC_EVERY_HOURS=0` (ou ausente), para rodar 1x por dia.
- `CLIMATE_AUTO_SYNC_RUN_ON_BOOT=true`: roda uma sincronização extra ao subir o backend.

### Adapter local INMET (somente alertas RSS/CAP)

Para avisos meteorológicos oficiais:

- `GET /api/inmet-adapter/alerts` → entrega JSON compatível com `INMET_ALERTS_JSON_URL`

Exemplo de `.env`:

```bash
INMET_ALERTS_JSON_URL=http://localhost:5000/api/inmet-adapter/alerts
ENABLE_INMET_ALERTS_SYNC=true
```

Detalhes das URLs oficiais e limitações (ex.: chuva em mm no produto municipal): **`DATA_SOURCES.md`**.

### Se já correste `seed:productivity`

Os registros com `data_source: 'inmet'` e valores “demo” **misturam-se** com os reais. Para partir só de dados oficiais de clima:

- Apague linhas de `climate_data` que não quiser manter, **ou**
- Limpe a tabela `climate_data` e rode de novo `npm run sync:climate` (após backup, se necessário).

## Produtividade agrícola (CONAB / IBGE / etc.)

**Não há** sincronização automática no repositório que baixe séries oficiais de produtividade para todas as UFs. O campo `data_source: 'conab'` nas seeds é **rótulo de exemplo**, não download da CONAB.

Para dados verdadeiros de produtividade:

1. Obter séries abertas nos portais oficiais (CONAB, IBGE/SIDRA, etc.) conforme a política de cada fonte.
2. Ingerir via ETL (CSV → `productivity`) ou implementar um conector dedicado (fora do escopo atual das seeds).

## Remover dados fictícios das seeds (já aplicados no banco)

1. **Clima inventado** (códigos `SEED`, `SEED-ALERT`, `A001`/`A002` do exemplo antigo):

```bash
cd back
npm run purge:seed
```

Isto **não** apaga linhas com `station_code` tipo `CPTEC:…` vindas de `npm run sync:climate`.

2. **Produtividade de demonstração** (tabela inteira, se só existia seed):

```bash
npm run purge:seed -- --productivity --yes
```

`geo_data` **não** é apagado (continua a servir de base para UF/capitais no sync). Para recomeçar geometrias, só apagando `geo_data` manualmente (cuidado com FKs).

## Resumo prático

| Necessidade | Ação |
|-------------|------|
| Clima real no app | `npm run seed:geo` (inclui municípios TO com `cptecCityQuery`) + `npm run sync:climate` (padrão: só Tocantins) |
| Voltar sync CPTEC em todas as capitais | `CLIMATE_SYNC_SCOPE=brasil` no `.env` e rodar `npm run sync:climate` |
| API / dashboard sem `?state=` | O resumo assume **Tocantins** (`DEFAULT_APP_UF`, padrão `TO` no código) |
| Só mapa/UF | `npm run seed:geo` (geometrias ainda são simplificadas; troque por GeoJSON IBGE se precisar precisão cartográfica) |
| Evitar números inventados de produtividade | Não usar `seed:productivity` em produção; carregar dados oficiais pelo teu pipeline |
| Limpar seed já aplicada | `npm run purge:seed` (e opcionalmente `--productivity --yes`) |
