const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const logger = require('./config/logger');
const { testConnection, syncDatabase } = require('./config/database');
const webhookRoutes = require('./routes/webhooks');
const errorHandler = require('./middleware/errorHandler');

// Importar modelos para inicializar relaciones
require('./models');

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: '*', // En producción, especificar dominios permitidos
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logger HTTP
app.use(morgan('combined', { stream: logger.stream }));

// Parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    mode: config.frapp.modoProduccion ? 'PRODUCTION' : 'TESTING'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Facturador Webhook Processor',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhooks: '/api/webhooks',
      docs: 'https://github.com/...'
    }
  });
});

// Routes
app.use('/api/webhooks', webhookRoutes);

// Error handler (debe ser el último middleware)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

// Iniciar servidor
async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.error('Database connection failed. Exiting...');
      process.exit(1);
    }

    // Sync database (create tables if not exist)
    logger.info('Synchronizing database...');
    await syncDatabase(false); // false = no drop existing tables

    // Start server
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`======================================`);
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Frapp Mode: ${config.frapp.modoProduccion ? 'PRODUCTION' : 'TESTING'}`);
      logger.info(`======================================`);
    });

  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start if not being imported
if (require.main === module) {
  startServer();
}

module.exports = app;
