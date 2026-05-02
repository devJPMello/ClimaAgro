const path = require('path');
// Carregar .env ANTES de qualquer módulo que use process.env (ex.: database.js)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { connectDB, sequelize, models } = require('./config/database');
const { startClimateAutoSyncScheduler } = require('./services/climateSyncScheduler');

const app = express();

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
// Webhook WhatsApp (parser específico na rota; Twilio = urlencoded, Z-API = JSON)
app.use('/webhook/whatsapp', require('./routes/whatsappWebhook'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/geo', require('./routes/geo'));
app.use('/api/productivity', require('./routes/productivity'));
app.use('/api/ibge-sidra-1612', require('./routes/ibgeSidra1612'));
app.use('/api/climate', require('./routes/climate'));
app.use('/api/clima', require('./routes/climate'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/hybrid-chat', require('./routes/hybridChat'));
app.use('/api/agronomos-parceiros', require('./routes/agronomosParceiros'));
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
  console.error('Error:', err.stack);
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
io.on('connection', (socket) => {
  socket.on('join:produtor', (clerkId) => {
    if (typeof clerkId === 'string' && clerkId.length > 4) {
      socket.join(`produtor:${clerkId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API: http://localhost:${PORT}/api  ·  health: http://localhost:${PORT}/api/health`);
  console.log(`💬 WebSocket: /socket.io  ·  Webhook: POST /webhook/whatsapp`);
  startClimateAutoSyncScheduler({ sequelize, models });
});

module.exports = { app, server, io };
