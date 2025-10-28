/**
 * Webhook Logger Utility
 * Agrupa logs por webhook ID y controla verbosidad
 */

const logger = require('../config/logger');

/**
 * Niveles de log disponibles
 */
const LOG_LEVELS = {
  MINIMAL: 'minimal',    // Solo pasos principales
  NORMAL: 'normal',      // Pasos + resultados
  VERBOSE: 'verbose',    // Todo incluyendo payloads
  DEBUG: 'debug'         // Absolutamente todo
};

/**
 * Crea un logger contextual para un webhook específico
 * @param {number} webhookId - ID del webhook
 * @param {string} logLevel - Nivel de verbosidad (minimal, normal, verbose, debug)
 * @returns {Object} Logger con contexto de webhook
 */
function createWebhookLogger(webhookId, logLevel = 'normal') {
  const prefix = `[Webhook:${webhookId}]`;
  const level = logLevel.toLowerCase();

  return {
    /**
     * Log de paso principal (siempre se muestra)
     */
    step(stepNumber, stepName, details = {}) {
      const detailsStr = Object.keys(details).length > 0
        ? ` - ${Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ')}`
        : '';
      logger.info(`${prefix} 📍 PASO ${stepNumber}: ${stepName}${detailsStr}`);
    },

    /**
     * Log de info general (se muestra en normal, verbose y debug)
     */
    info(service, message) {
      if (['normal', 'verbose', 'debug'].includes(level)) {
        logger.info(`${prefix} [${service}] ${message}`);
      }
    },

    /**
     * Log de éxito (se muestra en normal, verbose y debug)
     */
    success(service, message) {
      if (['normal', 'verbose', 'debug'].includes(level)) {
        logger.info(`${prefix} [${service}] ✅ ${message}`);
      }
    },

    /**
     * Log de advertencia (siempre se muestra)
     */
    warn(service, message) {
      logger.warn(`${prefix} [${service}] ⚠️ ${message}`);
    },

    /**
     * Log de error (siempre se muestra)
     */
    error(service, message, error = null) {
      const errorStr = error ? ` - Error: ${error.message}` : '';
      logger.error(`${prefix} [${service}] ❌ ${message}${errorStr}`);
    },

    /**
     * Log de payload (solo en verbose y debug)
     */
    payload(service, payloadName, payload) {
      if (['verbose', 'debug'].includes(level)) {
        logger.info(`${prefix} [${service}] 📦 ${payloadName}:`);
        logger.info(JSON.stringify(payload, null, 2));
      } else if (level === 'normal') {
        // En normal, solo mostrar un resumen
        const keys = Object.keys(payload).slice(0, 3).join(', ');
        const more = Object.keys(payload).length > 3 ? ` (+${Object.keys(payload).length - 3} más)` : '';
        logger.info(`${prefix} [${service}] 📦 ${payloadName}: {${keys}${more}}`);
      }
    },

    /**
     * Log de respuesta de API (solo en verbose y debug)
     */
    response(service, statusCode, summary) {
      if (['verbose', 'debug'].includes(level)) {
        logger.info(`${prefix} [${service}] 📨 Response ${statusCode}: ${summary}`);
      }
    },

    /**
     * Log de debug (solo en debug)
     */
    debug(service, message) {
      if (level === 'debug') {
        logger.debug(`${prefix} [${service}] 🔍 ${message}`);
      }
    },

    /**
     * Log de duración (se muestra en normal, verbose y debug)
     */
    duration(stepName, durationMs) {
      if (['normal', 'verbose', 'debug'].includes(level)) {
        const seconds = (durationMs / 1000).toFixed(2);
        logger.info(`${prefix} ⏱️ ${stepName} completado en ${seconds}s`);
      }
    },

    /**
     * Log de retry (se muestra en normal, verbose y debug)
     */
    retry(service, attempt, maxAttempts, reason) {
      if (['normal', 'verbose', 'debug'].includes(level)) {
        logger.warn(`${prefix} [${service}] 🔄 Reintento ${attempt}/${maxAttempts}: ${reason}`);
      }
    }
  };
}

/**
 * Determina el nivel de log basado en parámetros del webhook
 * @param {Object} webhook - Objeto webhook
 * @param {string} apiLogLevel - Nivel solicitado via API
 * @returns {string} Nivel de log a usar
 */
function determineLogLevel(webhook, apiLogLevel = null) {
  // Prioridad 1: Nivel solicitado via API
  if (apiLogLevel && Object.values(LOG_LEVELS).includes(apiLogLevel.toLowerCase())) {
    return apiLogLevel.toLowerCase();
  }

  // Prioridad 2: Variable de entorno
  const envLogLevel = process.env.WEBHOOK_LOG_LEVEL;
  if (envLogLevel && Object.values(LOG_LEVELS).includes(envLogLevel.toLowerCase())) {
    return envLogLevel.toLowerCase();
  }

  // Prioridad 3: Basado en ambiente
  if (process.env.NODE_ENV === 'development') {
    return LOG_LEVELS.VERBOSE;
  }

  // Default: normal en producción
  return LOG_LEVELS.NORMAL;
}

module.exports = {
  createWebhookLogger,
  determineLogLevel,
  LOG_LEVELS
};
