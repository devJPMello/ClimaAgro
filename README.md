# ClimaAgro

Plataforma full-stack para monitoramento climático e produtividade agrícola no Brasil, com foco atual em dados por **UF** e séries **mensais**.

## Estrutura do projeto

```
ClimaAgro/
├── back/                  # API Node.js + Express + Sequelize
├── new_front/             # Frontend React + TypeScript + Vite
├── ETL/                   # ETL SIDRA/IBGE (Python)
└── README.md
```

## Principais funcionalidades

- Dashboard climático com visão nacional por UF.
- Mapas climáticos e de produtividade em coroplético do Brasil.
- Séries temporais de clima e produtividade com filtros por UF, cultura e intervalo de anos.
- Comparativo de clima vs produtividade.
- Exportação de relatórios por intervalo de anos.
- Integração com SIDRA/IBGE e sincronização de clima (CPTEC/Open-Meteo).

## Requisitos

- Node.js 18+
- npm 9+
- Python 3.10+ (para ETL)
- PostgreSQL (com extensão PostGIS recomendada para dados geográficos)

## Setup rápido

### 1) Backend

```bash
cd back
npm install
cp env.example .env
npm run dev
```

API padrão: `http://localhost:5000`

### 2) Frontend

```bash
cd new_front
npm install
npm run dev
```

App padrão (Vite): `http://localhost:5173`

### 3) Testes frontend

```bash
cd new_front
npm run test
```

## Fluxo ETL de produtividade (SIDRA 1612)

1. Gere/atualize o CSV mensal por UF via script Python:

```bash
cd ETL
python etl_ibge_sidra_1612.py --help
```

2. Importe no backend:

```bash
cd back
npm run import:ibge1612 -- --replace
```

3. Sincronize para a tabela de produtividade:

```bash
cd back
npm run sync:productivity-ibge
```

## Scripts úteis (backend)

- `npm run migrate:climate-uf` — adiciona/backfill de `uf` em `climate_data`.
- `npm run geo:ensure-brazil-states` — garante UFs no `geo_data`.
- `npm run reset:state-level-data` — limpa tabelas de clima/produtividade/SIDRA/alertas/exportações.
- `npm run sync:climate` — sincroniza dados climáticos (escopo conforme variáveis de ambiente).

## Observações

- O frontend consome rotas em `/api/climate` (com alias `/api/clima` no backend).
- A opção `ALL` agrega dados climáticos nacionalmente por período.
- O filtro de produtividade mensal usa `mesAno` (`YYYY-MM`).
