const logger = require('../config/logger');

/**
 * Middleware global de manejo de errores
 */
function errorHandler(err, req, res, next) {
  // Log del error
  logger.error('Error en la aplicación:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });

  // Determinar código de estado
  const statusCode = err.statusCode || err.status || 500;

  // Responder al cliente
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Error interno del servidor',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}

module.exports = errorHandler;
