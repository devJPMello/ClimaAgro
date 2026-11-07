const path = require('path');
// Carregar .env ANTES de qualquer módulo que use process.env (ex.: database.js)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { connectDB, sequelize, models } = require('./config/database');
const { startClimateAutoSyncScheduler } = require('./services/climateSyncScheduler');
const logger = require('./lib/logger');

const RATE_LIMIT_MSG = { success: false, message: 'Muitas requisições. Tente novamente em 1 minuto.' };

function makeHandler(windowMs) {
  return (req, res, _next, options) => {
    const retryAfterSecs = Math.ceil((options?.windowMs ?? windowMs) / 1000);
    res.setHeader('Retry-After', retryAfterSecs);
    res.status(429).json(RATE_LIMIT_MSG);
  };
}

const isDev = () => process.env.NODE_ENV === 'development';

// 100 req/min — dados climáticos, produtividade, alertas, geo
const climateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CLIMATE_RATE_LIMIT_PER_MIN || 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
  skip: isDev,
});

// 30 req/min — autenticação, perfil, agrônomos, chat híbrido
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.USER_RATE_LIMIT_PER_MIN || 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
  skip: isDev,
});

// 20 req/min — relatórios e superset (I/O pesado, PDF, BI)
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.REPORT_RATE_LIMIT_PER_MIN || 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
  skip: isDev,
});

// 20 req/min — endpoints de IA (fallback global; ai.js aplica limites por rota também)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MIN || 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler(60 * 1000),
  skip: isDev,
});

const app = express();

// Atrás de proxy (Railway etc.): usa o IP real do cliente no rate limit. Ex.: TRUST_PROXY=1
if (process.env.TRUST_PROXY) {
  const n = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(n) ? n : process.env.TRUST_PROXY);
}

function parseFrontendOrigins() {
  const raw =
    process.env.FRONTEND_URL ||
    'http://localhost:3000,http://localhost:5173';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Middleware — CORP `same-origin` (padrão do Helmet) pode bloquear fetch cross-origin (ex.: Vite :5173 → API :5000).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      const allowed = parseFrontendOrigins();
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Export-Client-Id', 'X-Clerk-User-Id']
  })
);
// Webhook Evolution API WhatsApp (application/json — parser específico na rota)
app.use('/webhook/evolution', require('./routes/whatsappWebhook'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
connectDB();

// Rate limiting por grupo de rotas
app.use(
  ['/api/climate', '/api/clima', '/api/weather', '/api/productivity',
   '/api/ibge-sidra-1612', '/api/inmet-adapter', '/api/geo'],
  climateLimiter
);
app.use(
  ['/api/auth', '/api/users', '/api/dual-profile',
   '/api/hybrid-chat', '/api/agronomos-parceiros', '/api/agronomist-onboarding',
   '/api/admin'],
  userLimiter
);
app.use(['/api/reports', '/api/superset'], reportLimiter);
app.use('/api/ai', aiLimiter);

// Documentação Swagger — /api/docs (sem rate limit, sem auth)
{
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const path = require('path');
  const swaggerDoc = YAML.load(path.join(__dirname, 'docs/openapi.yaml'));
  app.use(
    '/api/docs',
    // Swagger UI precisa de inline scripts/styles — relaxa CSP apenas nesta rota
    (req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
      );
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerDoc, {
      customSiteTitle: 'ClimaAgro API Docs',
      swaggerOptions: { persistAuthorization: true },
    })
  );
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/geo', require('./routes/geo'));
app.use('/api/productivity', require('./routes/productivity'));
app.use('/api/ibge-sidra-1612', require('./routes/ibgeSidra1612'));
app.use('/api/climate', require('./routes/climate'));
app.use('/api/clima', require('./routes/climate'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/dual-profile', require('./routes/dualProfile'));
app.use('/api/hybrid-chat', require('./routes/hybridChat'));
app.use('/api/agronomos-parceiros', require('./routes/agronomosParceiros'));
app.use('/api/agronomist-onboarding', require('./routes/agronomistOnboarding'));
app.use('/api/admin/agronomos', require('./routes/adminAgronomos'));
app.use('/api/superset', require('./routes/superset'));
app.use('/api/inmet-adapter', require('./routes/inmetAdapter'));

// Raiz da API (abrir no browser em /api só mostrava 404 — não há recurso em GET /api antes)
app.get('/api', (req, res) => {
  res.json({
    success: true,
    name: 'ClimaAgro API',
    message: 'Rotas ficam em subcaminhos; exemplos abaixo.',
    examples: {
      health: '/api/health',
      dashboardSummary: '/api/climate/dashboard-summary',
      climateList: '/api/climate?state=SP&startDate=2025-01-01&endDate=2025-12-31&limit=10'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada'
  });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      const allowed = parseFrontendOrigins();
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token && process.env.CLERK_SECRET_KEY) {
    try {
      const { verifyToken } = require('@clerk/backend');
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      socket.data.clerkUserId = payload.sub;
    } catch {
      // Token present but invalid — reject connection
      return next(new Error('Token inválido'));
    }
  }
  next();
});

io.on('connection', (socket) => {
  socket.on('join:produtor', (clerkId) => {
    // Use verified identity from token; fall back to client claim only in dev
    const effectiveId = socket.data.clerkUserId || (typeof clerkId === 'string' && clerkId.length > 4 ? clerkId : null);
    if (effectiveId) {
      socket.join(`produtor:${effectiveId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API: http://localhost:${PORT}/api  ·  health: http://localhost:${PORT}/api/health`);
  console.log(`💬 WebSocket: /socket.io  ·  Webhook Evolution API: POST http://localhost:${PORT}/webhook/evolution`);

  const publicBase = String(process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (publicBase) {
    console.log(`📲 Evolution API — configure o webhook na instância (evento MESSAGES_UPSERT):`);
    console.log(`   POST ${publicBase}/webhook/evolution`);
  } else {
    console.log(`📲 Evolution API webhook: defina PUBLIC_API_BASE_URL no .env para ver a URL pública do webhook.`);
  }

  const evolutionOk = process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY;
  if (evolutionOk) {
    console.log(`✉️  Evolution API: envio de WhatsApp habilitado (instância: ${process.env.EVOLUTION_INSTANCE_NAME || 'climaagro'}).`);
  } else {
    console.log(`⚠️  Evolution API: envio desabilitado — defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME no .env`);
  }

  startClimateAutoSyncScheduler({ sequelize, models });
});

module.exports = { app, server, io };
