/**
 * Middleware de autenticación Bearer Token
 * Protege endpoints que requieren autenticación con token
 */

const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Valida el Bearer Token del header Authorization
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Siguiente middleware
 */
function authenticate(req, res, next) {
  try {
    // Obtener el header de autorización
    const authHeader = req.headers.authorization;

    // Verificar que exista el header
    if (!authHeader) {
      logger.warn('[Auth] Intento de acceso sin header Authorization');
      return res.status(401).json({
        success: false,
        error: 'No se proporcionó token de autenticación',
        message: 'Header Authorization requerido'
      });
    }

    // Verificar formato Bearer Token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logger.warn('[Auth] Formato de token inválido');
      return res.status(401).json({
        success: false,
        error: 'Formato de token inválido',
        message: 'Use: Authorization: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verificar que el token coincida con el configurado
    if (!config.api.bearerToken) {
      logger.error('[Auth] API_BEARER_TOKEN no configurado en variables de entorno');
      return res.status(500).json({
        success: false,
        error: 'Configuración de seguridad incompleta'
      });
    }

    if (token !== config.api.bearerToken) {
      logger.warn('[Auth] Token inválido proporcionado');
      return res.status(403).json({
        success: false,
        error: 'Token de autenticación inválido'
      });
    }

    // Token válido, continuar
    logger.debug('[Auth] Autenticación exitosa');
    next();

  } catch (error) {
    logger.error('[Auth] Error en middleware de autenticación:', error);
    res.status(500).json({
      success: false,
      error: 'Error en autenticación'
    });
  }
}

module.exports = authenticate;
