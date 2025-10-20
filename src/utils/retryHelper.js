/**
 * Helper para ejecutar funciones con reintentos automáticos
 * Usado en todas las llamadas a APIs externas
 */

const logger = require('../config/logger');

/**
 * Ejecuta una función con reintentos automáticos
 * @param {Function} fn - Función async a ejecutar
 * @param {Object} options - Opciones de reintento
 * @param {number} options.maxRetries - Número máximo de intentos (default: 5)
 * @param {number} options.delayMs - Delay en ms entre intentos (default: 1000)
 * @param {string} options.operationName - Nombre de la operación para logs
 * @returns {Promise<any>} - Resultado de la función
 */
async function retryOperation(fn, options = {}) {
  const {
    maxRetries = 5,
    delayMs = 1000,
    operationName = 'Operation'
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Retry] ${operationName} - Intento ${attempt}/${maxRetries}`);

      const result = await fn();

      logger.info(`[Retry] ${operationName} - Exitoso en intento ${attempt}`);
      return result;

    } catch (error) {
      lastError = error;
      logger.warn(`[Retry] ${operationName} - Error en intento ${attempt}/${maxRetries}: ${error.message}`);

      // Si no es el último intento, esperar antes de reintentar
      if (attempt < maxRetries) {
        logger.info(`[Retry] ${operationName} - Esperando ${delayMs}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  const errorMessage = `${operationName} falló después de ${maxRetries} intentos`;
  logger.error(`[Retry] ${errorMessage}:`, lastError);
  throw new Error(`${errorMessage}: ${lastError.message}`);
}

module.exports = {
  retryOperation
};
