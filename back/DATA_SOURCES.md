# Fontes oficiais de dados (referência para o time)

**Operação:** como popular o banco com **dados reais** de clima (sem usar seeds fictícias) está descrito em **`REAL_DATA.md`** na raiz do `back/`.

## CPTEC / INPE — previsão e produtos em XML

- **Documentação dos serviços XML (URLs, parâmetros `city`, código de localidade, lat/lon, formato XML):**  
  https://servicos.cptec.inpe.br/XML/
- **Formato:** XML (ISO-8859-1 no conteúdo; o cliente decodifica como latin1).
- **Limite de taxa:** não há cota pública documentada na página acima; use intervalos conservadores entre requisições em sincronização.
- **Termos:** uso conforme a política do INPE/CPTEC para os serviços públicos indicados na documentação.

### Observação sobre precipitação na previsão municipal

O XML de previsão por município (**`/cidade/{id}/previsao.xml`**, **`/cidade/7dias/{id}/previsao.xml`**) traz **sigla de tempo**, **máxima**, **mínima** e **IUV**, conforme a documentação — **não** informa precipitação acumulada em mm por dia. O backend grava a sigla em `climate_data.metadata.cptec` e classifica chuva **qualitativamente** com a tabela oficial de siglas. **Milímetros** de chuva devem vir de **estações (ex.: INMET / OGC)** ou de outro produto oficial que as forneça.

### METAR (umidade, vento, pressão)

- **URL documentada:** `http://servicos.cptec.inpe.br/XML/estacao/{ICAO}/condicoesAtuais.xml`  
  Elementos descritos na documentação: `pressao`, `temperatura`, `umidade`, `vento_dir`, `vento_int`, etc.  
  Com `CLIMATE_SYNC_SCOPE=tocantins` (padrão), o METAR de **Palmas (`SBPJ`)** é mesclado no registro do **dia corrente** (America/Sao_Paulo) desse município. Com `CLIMATE_SYNC_SCOPE=brasil`, a mescla segue a **capital** de cada UF.

## Open-Meteo — clima numérico diário (fonte primária de clima)

- **Endpoint base:** `https://api.open-meteo.com/v1/forecast`
- **Uso no ClimaAgro:** temperatura média/máx/mín, precipitação mm/dia, umidade média, vento e pressão para municípios do Tocantins.
- **Parâmetros usados:** `daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_mean`, `past_days`, `forecast_days`, `timezone`.
- **Variáveis:** `ENABLE_OPEN_METEO_SYNC`, `OPEN_METEO_BASE_URL`, `OPEN_METEO_PAST_DAYS`, `OPEN_METEO_FORECAST_DAYS`, `OPEN_METEO_TIMEZONE`.

## INMET — alertas oficiais (RSS/CAP)

- **Avisos / alertas (portal):** https://alertas2.inmet.gov.br/ — uso web; para automação estável o time pode publicar um JSON agregado (ver variável `INMET_ALERTS_JSON_URL` no `.env.example`) a partir dos avisos oficiais, no contrato abaixo.

### Contrato JSON intermediário para `INMET_SYNC_ITEMS_URL` (legado/opcional)

Para usar `https://apitempo.inmet.gov.br` (ou qualquer outra fonte) no sync atual, publique um endpoint intermediário que retorne **GeoJSON FeatureCollection** com os campos abaixo.  
Isso mantém o `inmetClient.normalizeFeature()` compatível sem reescrever o pipeline.

Resposta esperada:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-48.3336, -10.1832] },
      "properties": {
        "date": "2026-04-17",
        "station_id": "A009",
        "name": "PALMAS",
        "max_temperature": 33.2,
        "min_temperature": 22.1,
        "avg_temperature": 27.4,
        "precipitation": 12.6,
        "humidity": 71.0,
        "wind_speed": 18.4,
        "pressure": 1009.3
      }
    }
  ]
}
```

Aliases aceitos pelo parser atual (use os que existirem na tua fonte):

- **Data:** `DATA`, `data`, `datetime`, `date`
- **Precipitação (mm):** `CHUVA`, `precipitation`, `PREC`, `RR`, `prec`
- **Temperatura máx:** `TEM_MAX`, `tem_max`, `max_temperature`, `temperature_max`, `TX`
- **Temperatura mín:** `TEM_MIN`, `tem_min`, `min_temperature`, `temperature_min`, `TN`
- **Temperatura média:** `TEM_MED`, `tem_med`, `avg_temperature`, `temperature_avg`, `TEMP_MED`
- **Umidade:** `UMD`, `humidity`, `UR`
- **Vento:** `VEN_VEL`, `wind_speed`, `WS`
- **Pressão:** `PRES`, `pressure`, `PRESS`
- **Código da estação:** `CD_ESTACAO`, `station_id`, `id`, `codigo`
- **Nome da estação:** `DC_NOME`, `name`, `estacao`

Observações práticas:

- `date` deve estar em `YYYY-MM-DD` (se vier com horário, o backend corta para data).
- `coordinates` deve ser `[lon, lat]`.
- Valores sentinela `9999` e `-9999` são descartados automaticamente.
- Como o sync atual faz lookup espacial em `geo_data` de categoria `state`, a feature precisa cair dentro do polígono da UF para ser gravada.

### Adapter interno (implementado no backend)

Para facilitar integração com `apitempo`/RSS sem mudar o pipeline principal, o backend expõe:

- `GET /api/inmet-adapter/features`  
  - Query opcional: `startDate`, `endDate`, `stations=A009,A010`  
  - Também lê `INMET_ADAPTER_STATION_CODES` no `.env`
- `GET /api/inmet-adapter/alerts`  
  - Lê RSS/CAP do INMET e retorna o contrato JSON de alertas aceito pelo app

Variáveis úteis:

- `INMET_ADAPTER_BASE_URL` (default: `https://apitempo.inmet.gov.br`)
- `INMET_ADAPTER_ALERT_RSS_URL` (default: `https://apiprevmet3.inmet.gov.br/avisos/rss`)
- `INMET_ADAPTER_STATION_CODES` (ex.: `A009,A010,A013`)
- `INMET_ADAPTER_LOOKBACK_DAYS` (default: `1`)

### Contrato JSON para `INMET_ALERTS_JSON_URL` (ingestão no Postgres, tabela `official_alerts`)

Resposta esperada (objeto ou array):

```json
{
  "items": [
    {
      "id": "identificador-estavel-do-aviso",
      "titulo": "Título do aviso",
      "descricao": "Texto detalhado",
      "severidade": "moderada",
      "vigenciaInicio": "2026-04-16",
      "vigenciaFim": "2026-04-18",
      "estados": ["SP", "MG"]
    }
  ]
}
```

Campos aceitos também em inglês: `title`, `description`, `severity`, `validFrom`, `validTo`, `states`. Severidade em português ou inglês é normalizada para `low|medium|high|critical` na API do app.

### Camadas no app (`GET /api/climate/alerts`)

1. **Produtos explícitos de alerta** — linhas em `official_alerts` (sync com `ENABLE_INMET_ALERTS_SYNC` + `INMET_ALERTS_JSON_URL`) e, opcionalmente, o mesmo contrato JSON lido **na hora** de URLs HTTPS em `OFFICIAL_ALERT_JSON_URLS` quando `ALERTS_FETCH_LIVE_ON_READ=true`. Itens já presentes no banco (mesmo `external_id`) não são duplicados na leitura ao vivo.
2. **Produtos CPTEC em `ClimateData`** — sigla de tempo da previsão municipal (chuva qualitativa) e vento quando vier de METAR CPTEC (`fonte` `cptec` no DTO).
3. **Regras derivadas** — limites em temperatura, chuva mm, umidade, etc. a partir de `ClimateData` (`fonte` `derivado`).

A resposta inclui `resumoCamadas` com contagens por grupo.

### Descoberta WMO (referência estável para o produto INMET CAP)

- Metadado de descoberta WIS2 para avisos CAP do centro **br-inmet** (não é o payload dos avisos, mas documenta o produto e links relacionados):  
  https://wis2-gdc.weather.gc.ca/collections/wis2-discovery-metadata/items/urn:wmo:md:br-inmet:alerts?f=json  

Para **ingestão HTTP estável** no ClimaAgro, o time continua apontando `INMET_ALERTS_JSON_URL` / `OFFICIAL_ALERT_JSON_URLS` para JSON no contrato acima (ETL, CDN ou outro endpoint sob controle), em vez de depender de páginas HTML do portal.

- **Portal INMET (acesso a dados, estações, orientações):**  
  https://portal.inmet.gov.br/
- **BDMEP (banco de dados meteorológicos, interface web):**  
  https://bdmep.inmet.gov.br/
- **Catálogo WIS2 Brazil / OGC API Features (JSON em `/collections`, itens em `/collections/{id}/items`):**  
  `https://wis2bra.inmet.gov.br/oapi` — listagem: `https://wis2bra.inmet.gov.br/oapi/collections?f=json`  
  A disponibilidade e os nomes exatos das coleções devem ser confirmados no catálogo oficial (pode exigir rede/User-Agent aceitável).
- **Formato:** JSON (OGC API Features) nas rotas `oapi`; demais produtos podem ser arquivos ou outros formatos conforme o catálogo.
- **Parâmetros típicos (OGC):** `f=json`, `limit`, `bbox`, conforme padrão OGC API Features e o que o catálogo INMET expuser.
- **Limite de taxa / termos:** seguir o que constar no portal/catálogo oficial; se o acesso automatizado não for permitido ou for instável, configurar fallback (mensagem de erro) e/ou mock apenas em desenvolvimento.
