const { sequelize } = require('../config/database');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * Ejecuta migraciones SQL pendientes
 * Este endpoint es temporal y debe ser eliminado después de ejecutar las migraciones
 */
async function runMigrations(req, res) {
  try {
    logger.info('[Migration] Iniciando ejecución de migraciones...');

    const migrationFile = path.join(__dirname, '../../migrations/20251022_add_payload_response_to_webhook_logs.sql');

    // Verificar si el archivo existe
    if (!fs.existsSync(migrationFile)) {
      return res.status(404).json({
        success: false,
        error: 'Archivo de migración no encontrado',
        path: migrationFile
      });
    }

    // Leer el archivo SQL
    const sqlContent = fs.readFileSync(migrationFile, 'utf8');
    logger.info('[Migration] Archivo de migración cargado');

    // Verificar si las columnas ya existen
    const checkQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'webhook_processing_logs'
      AND column_name IN ('request_payload', 'response_data');
    `;

    const existingColumns = await sequelize.query(checkQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    if (existingColumns.length === 2) {
      logger.info('[Migration] Las columnas ya existen, migración no necesaria');
      return res.json({
        success: true,
        message: 'Migración ya ejecutada previamente',
        columns_found: existingColumns.map(c => c.column_name)
      });
    }

    // Ejecutar la migración
    logger.info('[Migration] Ejecutando SQL...');
    await sequelize.query(sqlContent);
    logger.info('[Migration] ✅ Migración ejecutada exitosamente');

    // Verificar que se crearon las columnas
    const verifyColumns = await sequelize.query(checkQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    // Verificar índices creados
    const checkIndexes = `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'webhook_processing_logs'
      AND indexname IN ('idx_webhook_logs_request_payload', 'idx_webhook_logs_response_data');
    `;

    const createdIndexes = await sequelize.query(checkIndexes, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      message: 'Migración ejecutada exitosamente',
      columns_created: verifyColumns.map(c => c.column_name),
      indexes_created: createdIndexes.map(i => i.indexname),
      migration_file: '20251022_add_payload_response_to_webhook_logs.sql'
    });

  } catch (error) {
    logger.error('[Migration] Error ejecutando migración:', error);
    res.status(500).json({
      success: false,
      error: 'Error ejecutando migración',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Verifica el estado de las migraciones
 */
async function checkMigrationStatus(req, res) {
  try {
    // Verificar columnas
    const checkColumns = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'webhook_processing_logs'
      AND column_name IN ('request_payload', 'response_data');
    `;

    const columns = await sequelize.query(checkColumns, {
      type: sequelize.QueryTypes.SELECT
    });

    // Verificar índices
    const checkIndexes = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'webhook_processing_logs'
      AND indexname IN ('idx_webhook_logs_request_payload', 'idx_webhook_logs_response_data');
    `;

    const indexes = await sequelize.query(checkIndexes, {
      type: sequelize.QueryTypes.SELECT
    });

    const migrationComplete = columns.length === 2 && indexes.length === 2;

    res.json({
      success: true,
      migration_status: migrationComplete ? 'completed' : 'pending',
      columns: {
        found: columns.length,
        expected: 2,
        details: columns
      },
      indexes: {
        found: indexes.length,
        expected: 2,
        details: indexes
      }
    });

  } catch (error) {
    logger.error('[Migration] Error verificando estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error verificando estado de migración',
      details: error.message
    });
  }
}

module.exports = {
  runMigrations,
  checkMigrationStatus
};
