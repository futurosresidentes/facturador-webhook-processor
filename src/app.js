const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const logger = require('./config/logger');
const { testConnection, syncDatabase } = require('./config/database');
const webhookRoutes = require('./routes/webhooks');
const featureFlagsRoutes = require('./routes/featureFlags');
const cacheRoutes = require('./routes/cache');
const errorHandler = require('./middleware/errorHandler');

require('./models');

const app = express();

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined', { stream: logger.stream }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    mode: config.frapp.modoProduccion ? 'PRODUCTION' : 'TESTING'
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Facturador Webhook Processor',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhooks: '/api/webhooks',
      featureFlags: '/api/feature-flags',
      cache: '/api/cache'
    }
  });
});

app.use('/api/webhooks', webhookRoutes);
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/cache', cacheRoutes);

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

async function startServer() {
  try {
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error('Database connection failed. Exiting...');
      process.exit(1);
    }

    logger.info('Synchronizing database...');
    await syncDatabase(false);

    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`======================================`);
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Frapp Mode: ${config.frapp.modoProduccion ? 'PRODUCTION' : 'TESTING'}`);
      logger.info(`======================================`);

      // Inicializar caché de ciudades de World Office
      // Esto cargará las ~1100 ciudades de Colombia desde la API de WO
      setTimeout(() => {
        require('./services/worldOfficeCityCache');
      }, 500);
    });

  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = app;
