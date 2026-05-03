# ClimaAgro Backend

Backend API para o sistema ClimaAgro - Sistema de monitoramento climático para agricultura com suporte geoespacial.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **PostgreSQL + PostGIS** - Banco de dados geoespacial
- **Sequelize** - ORM para PostgreSQL
- **JWT** - Autenticação
- **Bcrypt** - Criptografia de senhas
- **Express Validator** - Validação de dados
- **Turf.js** - Processamento geoespacial

## 📁 Estrutura do Projeto

```
back/
├── src/
│   ├── config/
│   │   └── database.js          # Configuração PostgreSQL + PostGIS
│   ├── middleware/
│   │   ├── auth.js             # Middleware de autenticação
│   │   └── validation.js       # Validações de dados
│   ├── models/
│   │   ├── User.js             # Modelo de usuário
│   │   ├── Weather.js          # Modelo de dados climáticos
│   │   ├── Alert.js            # Modelo de alertas
│   │   ├── Report.js           # Modelo de relatórios
│   │   └── GeoData.js          # Modelo de dados geoespaciais
│   ├── routes/
│   │   ├── auth.js             # Rotas de autenticação
│   │   ├── weather.js          # Rotas de dados climáticos
│   │   ├── alerts.js           # Rotas de alertas
│   │   ├── reports.js          # Rotas de relatórios
│   │   ├── users.js            # Rotas de usuários
│   │   └── geo.js              # Rotas geoespaciais
│   ├── scripts/
│   │   └── seedGeoData.js      # Script de dados geoespaciais
│   └── server.js               # Servidor principal
├── package.json
├── .env.example
└── README.md
```

## 🛠️ Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd ClimaAgro/back
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. **Configure o PostgreSQL com PostGIS**
```sql
CREATE DATABASE climaagro;
CREATE EXTENSION postgis;
```

5. **Execute o servidor**
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

6. **Popular dados geoespaciais (opcional)**
```bash
npm run seed:geo
```

## 🔧 Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
# Server
PORT=5000
NODE_ENV=development

# Database PostgreSQL + PostGIS
DATABASE_URL=postgresql://username:password@localhost:5432/climaagro
POSTGRES_URL=postgresql://username:password@localhost:5432/climaagro

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=7d

# Email (opcional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Weather API (opcional)
WEATHER_API_KEY=your_weather_api_key
WEATHER_API_URL=https://api.openweathermap.org/data/2.5

# CORS
FRONTEND_URL=http://localhost:3000

# URL pública do backend (sem /api) — só para você saber o link do webhook no console ao subir o servidor
PUBLIC_API_BASE_URL=https://seu-ngrok.ngrok-free.app

# Twilio WhatsApp (escalação + respostas do agrônomo)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Twilio (WhatsApp)

1. No [Console Twilio](https://console.twilio.com/), copie **Account SID** e **Auth Token**.
2. **`TWILIO_WHATSAPP_FROM`**: número WhatsApp da Twilio no formato `whatsapp:+DDI...` (sandbox ou número aprovado).
3. **Inbound (agrônomo responde):** em Messaging → WhatsApp → configure **When a message comes in** → **HTTP POST** para:
   - Produção: `https://SEU_DOMINIO/webhook/whatsapp`
   - Dev: use [ngrok](https://ngrok.com/) ou Cloudflare Tunnel na porta do backend e use essa URL **HTTPS**.
4. Opcional: no `.env`, defina **`PUBLIC_API_BASE_URL`** com essa mesma base (ex.: `https://abc.ngrok-free.app`). Ao iniciar o servidor, o log mostra o POST completo para colar no Twilio.
5. **Sandbox:** só conversa com números que mandaram o código `join …` do sandbox.

## 📚 API Endpoints

### Autenticação (`/api/auth`)
- `POST /register` - Registrar usuário
- `POST /login` - Login
- `GET /me` - Dados do usuário logado
- `PUT /profile` - Atualizar perfil
- `POST /change-password` - Alterar senha
- `POST /logout` - Logout
- `DELETE /account` - Deletar conta

### Dados Climáticos (`/api/weather`)
- `GET /current` - Dados atuais
- `GET /history` - Histórico
- `GET /states` - Lista de estados
- `GET /cities/:state` - Cidades por estado
- `GET /statistics` - Estatísticas
- `POST /` - Adicionar dados (admin)

### Alertas (`/api/alerts`)
- `GET /` - Listar alertas
- `GET /active` - Alertas ativos
- `GET /:id` - Alerta específico
- `POST /` - Criar alerta (admin)
- `PUT /:id` - Atualizar alerta (admin)
- `DELETE /:id` - Deletar alerta (admin)
- `POST /:id/acknowledge` - Reconhecer alerta
- `GET /statistics` - Estatísticas

### Relatórios (`/api/reports`)
- `POST /generate` - Gerar relatório
- `GET /` - Listar relatórios
- `GET /:id` - Relatório específico
- `GET /:id/download` - Download
- `DELETE /:id` - Deletar relatório
- `GET /statistics` - Estatísticas

### Dados Geoespaciais (`/api/geo`)
- `GET /regions` - Listar regiões
- `GET /states` - Listar estados
- `GET /municipalities` - Listar municípios
- `GET /feature-collection` - Dados como GeoJSON
- `GET /proximity` - Buscar por proximidade
- `POST /polygon-search` - Buscar por polígono
- `GET /regional-stats` - Estatísticas regionais
- `GET /weather-stations` - Estações meteorológicas
- `POST /intersection` - Buscar por interseção

### Usuários (`/api/users`) - Admin
- `GET /` - Listar usuários
- `GET /:id` - Usuário específico
- `PUT /:id` - Atualizar usuário
- `DELETE /:id` - Deletar usuário
- `GET /statistics` - Estatísticas
- `POST /:id/reset-password` - Resetar senha
- `POST /:id/toggle-status` - Ativar/desativar

## 🌍 Funcionalidades Geoespaciais

### Consultas Espaciais
- **Proximidade**: Buscar dados em um raio específico
- **Polígonos**: Consultas dentro de áreas geográficas
- **Interseção**: Cruzamento com camadas GeoJSON
- **Estatísticas Regionais**: Agregações por região

### Dados Administrativos
- Regiões do Brasil
- Estados e municípios
- Estações meteorológicas
- Zonas agrícolas

### Formatos Suportados
- GeoJSON
- WKT (Well-Known Text)
- Coordenadas geográficas (lat/lng)

## 🔐 Autenticação

O sistema usa JWT (JSON Web Tokens) para autenticação. Inclua o token no header:

```
Authorization: Bearer <token>
```

## 📊 Modelos de Dados

### User
- Dados pessoais e preferências
- Autenticação e permissões
- Histórico de atividades

### Weather
- Dados climáticos por localização
- Temperatura, umidade, precipitação
- Dados agrícolas (umidade do solo, etc.)
- Campos geoespaciais PostGIS

### Alert
- Alertas climáticos
- Severidade e tipo
- Recomendações
- Notificações de usuários

### Report
- Relatórios exportados
- Configurações de geração
- Dados processados
- Arquivos gerados

### GeoData
- Dados geoespaciais
- Geometrias PostGIS
- Propriedades administrativas
- Metadados de camadas

## 🚀 Scripts Disponíveis

```bash
npm start          # Iniciar servidor
npm run dev        # Desenvolvimento com nodemon
npm test           # Executar testes
npm run seed:geo   # Popular dados geoespaciais
npm run db:reset   # Resetar banco com dados iniciais
```

## 🔍 Health Check

```bash
GET /api/health
```

Retorna status do servidor e banco de dados.

## 📝 Logs

O sistema registra logs de:
- Conexões de banco
- Erros de API
- Processamento de relatórios
- Atividades de usuário

## 🛡️ Segurança

- Senhas criptografadas com bcrypt
- Validação de dados de entrada
- CORS configurado
- Helmet para headers de segurança
- Rate limiting (a implementar)

## 📈 Performance

- Índices espaciais GIST no PostGIS
- Consultas geoespaciais otimizadas
- Paginação em todas as listagens
- Cache de dados (a implementar)
- Compressão de respostas (a implementar)

## 🌐 PostGIS

O sistema utiliza PostgreSQL com extensão PostGIS para:
- Armazenamento de dados geoespaciais
- Consultas espaciais otimizadas
- Suporte a geometrias complexas
- Índices espaciais (GIST)
- Funções geoespaciais nativas

## 📖 Exemplos de Uso

### Buscar dados por proximidade
```bash
GET /api/geo/proximity?lat=-23.5505&lng=-46.6333&radius=50
```

### Buscar municípios por estado
```bash
GET /api/geo/municipalities?state=SP
```

### Obter FeatureCollection
```bash
GET /api/geo/feature-collection?category=municipality&state=SP
```

### Buscar por polígono
```bash
POST /api/geo/polygon-search
{
  "polygon": "POLYGON((-46.0 -23.0, -45.0 -23.0, -45.0 -22.0, -46.0 -22.0, -46.0 -23.0))",
  "type": "weather"
}
```

## 🔄 Próximas Implementações

- [ ] Integração com APIs de clima reais
- [ ] Sistema de notificações por email/SMS
- [ ] Cache Redis
- [ ] Rate limiting
- [ ] Logs estruturados
- [ ] Testes automatizados
- [ ] Documentação Swagger
- [ ] Docker containerization
- [ ] Integração com sensores IoT
- [ ] Machine Learning para previsões