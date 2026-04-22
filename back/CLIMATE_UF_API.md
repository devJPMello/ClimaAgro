# API de Clima por UF (nacional)

## Endpoints

- `GET /api/climate/ufs`
  - Lista UFs disponíveis (inclui `ALL`).
- `GET /api/climate/series?uf=SP&start=2020-01-01&end=2020-12-31&variavel=precipitacao`
- `GET /api/climate/series?uf=ALL&start=2020-01-01&end=2020-12-31&variavel=temperatura_media`
- Alias em português: os mesmos endpoints também respondem em `/api/clima/...`.

## Parâmetros

- `uf`: `ALL` ou UF válida (`AC..TO`).
- `start` e `end`: datas ISO (`YYYY-MM-DD`).
- `variavel`: `temperatura_media | temperatura_maxima | temperatura_minima | precipitacao | umidade | vento | pressao`.
- Paginação: `limit` (1..1000), `offset` (>=0).

## Exemplo de resposta

```json
{
  "success": true,
  "metadata": {
    "uf": "SP",
    "periodo": { "start": "2020-01-01", "end": "2020-12-31" },
    "variavel": "precipitacao",
    "fonte": "climate_data",
    "unidade": "mm"
  },
  "serieTemporal": [{ "date": "2020-01-01", "uf": "SP", "value": 12.4 }],
  "estatisticas": { "media": 10.8, "min": 0.0, "max": 67.2 },
  "pagination": { "limit": 365, "offset": 0, "returned": 365 }
}
```

## Migração / ETL

- Campo novo em `climate_data`: `uf`.
- Rodar:
  1. `cd back`
  2. `npm run migrate:climate-uf`
- O script cria coluna/índices (`uf`, `uf+date`) e faz backfill via `geo_data.state`.
- Para sincronizar clima nacional por UF:
  - `CLIMATE_SYNC_SCOPE=brasil`
  - `npm run sync:climate`
  - Padrão atual do backend já assume `brasil` se a variável não estiver definida.

## Validação local

1. `cd back && npm run test`
2. `cd new_front && npm run test`
3. Subir backend/frontend e validar no navegador:
   - Troca de UF em Séries Temporais.
   - Opção `Brasil (todos)` retornando agregado.
