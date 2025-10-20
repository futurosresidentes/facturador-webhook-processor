/**
 * Script para crear/sincronizar la base de datos
 * Ejecutar con: node src/config/migrate.js
 */

const { sequelize, testConnection, syncDatabase } = require('./database');
const logger = require('./logger');

async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Test connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Sync database (force=false para no eliminar datos existentes)
    await syncDatabase(false);

    logger.info('Database migration completed successfully!');
    logger.info('Tables created/updated:');
    logger.info('  - webhooks');
    logger.info('  - webhook_processing_logs');
    logger.info('  - contacts');
    logger.info('  - memberships');

    process.exit(0);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
