const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('./env');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  })
];

// Add file transports in production
if (config.nodeEnv === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  transports
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
