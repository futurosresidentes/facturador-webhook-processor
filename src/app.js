const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const logger = require('./config/logger');
const { testConnection, syncDatabase } = require('./config/database');
const webhookRoutes = require('./routes/webhooks');
const featureFlagsRoutes = require('./routes/featureFlags');
const migrationRoutes = require('./routes/migrations');
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
      migrations: '/api/migrations'
    }
  });
});

app.use('/api/webhooks', webhookRoutes);
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/migrations', migrationRoutes);

// Endpoint temporal para ejecutar migración (REMOVER DESPUÉS)
app.post('/api/setup', async (req, res) => {
  try {
    const { sequelize } = require('./config/database');
    const { QueryTypes } = require('sequelize');

    let tableCreated = false;
    let switchesInserted = 0;

    // Verificar si la tabla ya existe
    const tables = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_flags'",
      { type: QueryTypes.SELECT }
    );

    // Si la tabla NO existe, crearla
    if (tables.length === 0) {
      // Crear tabla
      await sequelize.query(`
        CREATE TABLE feature_flags (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) NOT NULL,
          value BOOLEAN NOT NULL DEFAULT true,
          description TEXT,
          updated_by VARCHAR(255),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // Crear índice único
      await sequelize.query(`
        CREATE UNIQUE INDEX feature_flags_key_unique ON feature_flags (key)
      `);

      tableCreated = true;
      logger.info('✅ Tabla feature_flags creada');
    }

    // Verificar cuántos switches existen
    const existingFlags = await sequelize.query(
      "SELECT key FROM feature_flags",
      { type: QueryTypes.SELECT }
    );

    const existingKeys = existingFlags.map(f => f.key);
    const requiredSwitches = [
      {
        key: 'MEMBERSHIPS_ENABLED',
        value: false,
        description: 'Controla si se crean membresías en Frapp. false = MODO TESTING (simula), true = MODO PRODUCCIÓN (crea real)',
        updated_by: 'migration'
      },
      {
        key: 'WORLDOFFICE_INVOICE_ENABLED',
        value: false,
        description: 'Controla si se crean facturas en World Office. false = MODO TESTING (simula), true = MODO PRODUCCIÓN (crea real)',
        updated_by: 'migration'
      },
      {
        key: 'WORLDOFFICE_DIAN_ENABLED',
        value: false,
        description: 'Controla si se emiten facturas ante la DIAN. false = DESACTIVADO (skip), true = ACTIVADO (emite)',
        updated_by: 'migration'
      }
    ];

    // Insertar switches que no existan
    for (const sw of requiredSwitches) {
      if (!existingKeys.includes(sw.key)) {
        await sequelize.query(`
          INSERT INTO feature_flags (key, value, description, updated_by, updated_at)
          VALUES (:key, :value, :description, :updated_by, NOW())
        `, {
          replacements: sw,
          type: QueryTypes.INSERT
        });
        switchesInserted++;
        logger.info(`✅ Switch ${sw.key} insertado`);
      }
    }

    if (tableCreated || switchesInserted > 0) {
      return res.json({
        success: true,
        message: tableCreated
          ? 'Tabla creada y switches insertados exitosamente'
          : `${switchesInserted} switch(es) insertado(s) exitosamente`,
        tableCreated,
        switchesInserted,
        switches: {
          MEMBERSHIPS_ENABLED: false,
          WORLDOFFICE_INVOICE_ENABLED: false,
          WORLDOFFICE_DIAN_ENABLED: false
        }
      });
    }

    // Si no se creó nada ni se insertó nada, es porque ya está todo
    res.json({
      success: true,
      message: 'La tabla y switches ya existen',
      alreadyExists: true,
      switchesCount: existingFlags.length
    });

  } catch (error) {
    logger.error('Error ejecutando migración:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
