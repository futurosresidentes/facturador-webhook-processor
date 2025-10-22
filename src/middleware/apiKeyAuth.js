/**
 * Middleware de autenticación por API Key
 * Protege endpoints sensibles con una API key
 */

const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Middleware que valida API Key en header Authorization
 * Uso: router.use(apiKeyAuth)
 */
function apiKeyAuth(req, res, next) {
  // Obtener API key del header Authorization
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn(`[ApiKeyAuth] Intento de acceso sin API key - IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'API key requerida. Use header: Authorization: Bearer YOUR_API_KEY'
    });
  }

  // Formato esperado: "Bearer API_KEY"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn(`[ApiKeyAuth] Formato de API key inválido - IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Formato inválido. Use: Authorization: Bearer YOUR_API_KEY'
    });
  }

  const apiKey = parts[1];
  const validApiKey = config.apiKey;

  // Validar API key
  if (apiKey !== validApiKey) {
    logger.warn(`[ApiKeyAuth] API key inválida - IP: ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: 'API key inválida'
    });
  }

  // API key válida, continuar
  logger.info(`[ApiKeyAuth] Acceso autorizado - IP: ${req.ip}`);
  next();
}

module.exports = apiKeyAuth;
