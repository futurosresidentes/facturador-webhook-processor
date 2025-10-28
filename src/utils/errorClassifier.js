/**
 * Error Classifier
 * Clasifica errores como retriables (reintentar automáticamente) o fatales (requiere intervención manual)
 */

/**
 * Errores que pueden resolverse con un reintento
 * Generalmente son errores temporales de red, timeout, o BD
 */
const RETRIABLE_ERRORS = [
  // Errores de Sequelize
  'SequelizeUniqueConstraintError',     // Ya existe (podemos continuar con el siguiente stage)
  'SequelizeConnectionError',           // BD temporalmente caída
  'SequelizeConnectionRefusedError',    // Conexión rechazada temporalmente
  'SequelizeTimeoutError',              // Timeout de query
  'SequelizeDatabaseError',             // Error genérico de BD (puede ser temporal)

  // Errores de red
  'ECONNREFUSED',                       // API externa caída
  'ETIMEDOUT',                          // Timeout
  'ECONNRESET',                         // Conexión reseteada
  'ENOTFOUND',                          // DNS no encontrado (temporal)
  'NetworkError',                       // Error de red genérico
  'RequestTimeout',                     // Timeout de request
  'ESOCKETTIMEDOUT',                    // Socket timeout

  // Errores HTTP retriables
  'HTTP_500',                           // Internal Server Error (puede ser temporal)
  'HTTP_502',                           // Bad Gateway (servicio caído temporalmente)
  'HTTP_503',                           // Service Unavailable
  'HTTP_504',                           // Gateway Timeout
  'HTTP_429',                           // Too Many Requests (rate limit - esperar y reintentar)

  // Errores de APIs externas (temporales)
  'FR360_TIMEOUT',
  'CALLBELL_RATE_LIMIT',
  'WORLDOFFICE_UNAVAILABLE',
  'STRAPI_CONNECTION_ERROR'
];

/**
 * Errores que NO pueden resolverse con reintentos
 * Requieren intervención manual o corrección de datos
 */
const FATAL_ERRORS = [
  // Errores de validación
  'ValidationError',                    // Datos inválidos en el modelo
  'SequelizeValidationError',           // Validación de Sequelize fallida

  // Errores de datos
  'INVOICE_NOT_FOUND',                  // Invoice no existe en FR360
  'PAYMENT_LINK_NOT_FOUND',             // Payment link no encontrado
  'PRODUCT_NOT_MAPPED',                 // Producto no configurado en el sistema
  'CUSTOMER_BLOCKED',                   // Cliente bloqueado en el sistema
  'INVALID_EMAIL_FORMAT',               // Email inválido
  'INVALID_PHONE_FORMAT',               // Teléfono inválido
  'MISSING_REQUIRED_FIELD',             // Campo requerido faltante

  // Errores HTTP fatales
  'HTTP_400',                           // Bad Request (datos incorrectos)
  'HTTP_401',                           // Unauthorized (credenciales inválidas)
  'HTTP_403',                           // Forbidden (sin permisos)
  'HTTP_404',                           // Not Found (recurso no existe)
  'HTTP_422',                           // Unprocessable Entity (datos inválidos)

  // Errores de configuración
  'MISSING_API_KEY',                    // Falta API key en configuración
  'INVALID_API_CREDENTIALS',            // Credenciales de API inválidas
  'FEATURE_FLAG_DISABLED',              // Feature flag desactivado (no reintentar)

  // Errores de lógica de negocio
  'DUPLICATE_MEMBERSHIP',               // Membresía ya existe
  'EXPIRED_PAYMENT_LINK',               // Link de pago expirado
  'INSUFFICIENT_PERMISSIONS',           // Sin permisos para la operación
  'BUSINESS_RULE_VIOLATION'             // Violación de regla de negocio
];

/**
 * Mensajes de error que indican que el error es retriable
 * Se usa cuando el error.name no está en las listas anteriores
 */
const RETRIABLE_ERROR_MESSAGES = [
  'timeout',
  'timed out',
  'connection refused',
  'econnrefused',
  'socket hang up',
  'network error',
  'temporarily unavailable',
  'service unavailable',
  'too many requests',
  'rate limit exceeded',
  'getaddrinfo ENOTFOUND'
];

/**
 * Mensajes de error que indican que el error es fatal
 */
const FATAL_ERROR_MESSAGES = [
  'not found',
  'invalid',
  'missing required',
  'unauthorized',
  'forbidden',
  'bad request',
  'validation failed',
  'already exists',
  'duplicate',
  'malformed'
];

/**
 * Determina si un error es retriable o fatal
 * @param {Error} error - El error a clasificar
 * @returns {boolean} - true si es retriable, false si es fatal
 */
function isRetriableError(error) {
  if (!error) return false;

  const errorName = error.name || '';
  const errorCode = error.code || '';
  const errorMessage = (error.message || '').toLowerCase();
  const httpStatus = error.status || error.statusCode;

  // 1. Verificar por nombre de error
  if (RETRIABLE_ERRORS.includes(errorName)) {
    return true;
  }

  if (FATAL_ERRORS.includes(errorName)) {
    return false;
  }

  // 2. Verificar por código de error
  if (RETRIABLE_ERRORS.includes(errorCode)) {
    return true;
  }

  if (FATAL_ERRORS.includes(errorCode)) {
    return false;
  }

  // 3. Verificar por HTTP status code
  if (httpStatus) {
    const statusStr = `HTTP_${httpStatus}`;
    if (RETRIABLE_ERRORS.includes(statusStr)) {
      return true;
    }
    if (FATAL_ERRORS.includes(statusStr)) {
      return false;
    }
  }

  // 4. Verificar por mensaje de error (más flexible)
  for (const keyword of RETRIABLE_ERROR_MESSAGES) {
    if (errorMessage.includes(keyword)) {
      return true;
    }
  }

  for (const keyword of FATAL_ERROR_MESSAGES) {
    if (errorMessage.includes(keyword)) {
      return false;
    }
  }

  // 5. Por defecto, considerar retriable (más seguro)
  // Si no sabemos qué tipo de error es, mejor intentar reintentar
  return true;
}

/**
 * Obtiene información detallada del error para logging
 * @param {Error} error - El error a analizar
 * @returns {Object} - Información estructurada del error
 */
function getErrorDetails(error) {
  if (!error) return null;

  return {
    type: error.name || 'UnknownError',
    message: error.message || 'No error message',
    code: error.code || null,
    status: error.status || error.statusCode || null,
    is_retriable: isRetriableError(error),
    stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : null, // Primeras 5 líneas del stack
    original_error: error.original ? {
      message: error.original.message,
      code: error.original.code
    } : null
  };
}

/**
 * Genera un mensaje de contexto útil para el error
 * @param {Error} error - El error
 * @param {string} stage - El stage donde ocurrió el error
 * @returns {string} - Mensaje de contexto
 */
function getErrorContext(error, stage) {
  const details = getErrorDetails(error);

  if (details.type === 'SequelizeUniqueConstraintError') {
    return `Registro duplicado detectado en stage '${stage}'. El registro ya existe en la base de datos.`;
  }

  if (details.code === 'ECONNREFUSED') {
    return `No se pudo conectar al servicio externo en stage '${stage}'. El servicio puede estar caído temporalmente.`;
  }

  if (details.status === 429) {
    return `Rate limit excedido en stage '${stage}'. Demasiadas solicitudes al servicio externo.`;
  }

  if (details.type === 'ValidationError') {
    return `Datos inválidos en stage '${stage}'. Revisar los datos del webhook antes de reintentar.`;
  }

  if (!details.is_retriable) {
    return `Error fatal en stage '${stage}'. Requiere intervención manual para corregir el problema.`;
  }

  return `Error temporal en stage '${stage}'. El sistema puede reintentar automáticamente.`;
}

module.exports = {
  isRetriableError,
  getErrorDetails,
  getErrorContext,
  RETRIABLE_ERRORS,
  FATAL_ERRORS
};
