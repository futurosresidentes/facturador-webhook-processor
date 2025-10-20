const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('./logger');

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database.url || {
    database: config.database.name,
    username: config.database.user,
    password: config.database.password,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
    dialectOptions: {
      ssl: config.nodeEnv === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    return false;
  }
};

// Sync database (create tables if not exist)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    logger.info(`Database synchronized ${force ? '(forced)' : ''}`);
  } catch (error) {
    logger.error('Error synchronizing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase
};
