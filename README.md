# ClimaAgro

Plataforma full-stack para monitoramento climático e produtividade agrícola no Brasil, com dados por **UF**, alertas oficiais e um assistente com IA (IAgro) para produtores rurais.

**Acesse:** https://climaagro.onrender.com

> Hospedado no plano gratuito do Render: o primeiro acesso após um tempo parado pode levar de 30 a 60 segundos.

## Principais funcionalidades

- **Dashboard** com indicadores climáticos nacionais e resumo por localidade.
- **Mapa Climático** e **Mapa de Produtividade** (coroplético por UF).
- **Séries temporais** de clima e produtividade com filtros por UF, cultura e período.
- **Comparativo clima × produtividade** por safra.
- **Alertas oficiais** do INMET, atualizados automaticamente.
- **IAgro**: assistente com IA (Google Gemini) que responde com base nos dados da plataforma e analisa fotos.
- **Exportação de relatórios** (inclusive gerados por IA).

## Arquitetura

```
 Navegador (React + TS + Vite, Tailwind, Clerk)
        │  HTTPS / JSON
        ▼
 API Node.js + Express + Sequelize ──► PostgreSQL + PostGIS (Neon)
        │
        ├─► Open-Meteo, CPTEC/INPE (clima)
        ├─► INMET (alertas oficiais)
        ├─► IBGE/SIDRA (produtividade agrícola, via ETL em Python)
        └─► Google Gemini (IAgro)

 GitHub Actions ──(06h e 18h)──► POST /api/climate/sync
```

| Camada | Tecnologias |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts, Leaflet, Clerk |
| Backend | Node.js, Express, Sequelize, Helmet, express-rate-limit |
| Banco | PostgreSQL + PostGIS (Neon) |
| Dados | Open-Meteo, CPTEC/INPE, INMET, IBGE/SIDRA (tabela 1612) |
| Deploy | Render (site estático + API), GitHub Actions (sincronização agendada) |

## Estrutura do projeto

```
ClimaAgro/
├── back/                  # API Node.js + Express + Sequelize
├── new_front/             # Frontend React + TypeScript + Vite
├── ETL/                   # ETL SIDRA/IBGE (Python)
├── .github/workflows/     # Sincronização climática agendada
└── render.yaml            # Blueprint de deploy no Render
```

Fontes de dados detalhadas em [`back/DATA_SOURCES.md`](back/DATA_SOURCES.md).

## Requisitos

- Node.js 18+ (deploy usa 22)
- npm 9+
- Python 3.10+ (para o ETL)
- PostgreSQL com extensão PostGIS

## Rodando localmente

### 1) Backend

```bash
cd back
npm install
cp .env.example .env   # preencha DATABASE_URL, chaves do Clerk etc.
npm run dev
```

API padrão: `http://localhost:5000`

### 2) Frontend

```bash
cd new_front
npm install
cp .env.example .env
npm run dev
```

App padrão (Vite): `http://localhost:5173`

### 3) Testes

```bash
cd back && npm test        # Jest + Supertest
cd new_front && npm test   # Vitest + Testing Library
```

## Deploy

O arquivo [`render.yaml`](render.yaml) cria a API e o site no Render. Os segredos (banco, Clerk, Gemini, `CLIMATE_SYNC_SECRET`) são definidos no painel do Render.

Como no plano gratuito a API dorme sem uso, o workflow [`climate-sync.yml`](.github/workflows/climate-sync.yml) acorda a API duas vezes por dia e sincroniza clima e alertas. Ele usa o segredo `CLIMATE_SYNC_SECRET` do repositório, igual ao configurado na API.

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
