const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Consulta el API de FR360 para obtener información del payment link
 * Reintenta hasta maxRetries veces con delay entre intentos
 * @param {string} invoiceId - ID del invoice
 * @returns {Object} - Datos del payment link
 */
async function getPaymentLink(invoiceId) {
  const url = `${config.fr360.apiUrl}/payment-links/list?invoiceId=${invoiceId}`;
  const maxRetries = config.fr360.maxRetries;
  const retryDelay = config.fr360.retryDelay;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[FR360] Intento ${attempt}/${maxRetries} para invoice: ${invoiceId}`);

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${config.fr360.bearerToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        const result = response.data;

        if (result.status === 'success' && result.data && result.data.length > 0) {
          logger.info(`[FR360] Consulta exitosa en intento ${attempt}`);
          return result.data[0];
        } else {
          throw new Error(`Respuesta exitosa pero sin datos: ${JSON.stringify(result)}`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      }

    } catch (error) {
      lastError = error;
      logger.warn(`[FR360] Error en intento ${attempt}/${maxRetries}: ${error.message}`);

      if (attempt < maxRetries) {
        logger.info(`[FR360] Esperando ${retryDelay}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  const errorMessage = `[FR360] Falló después de ${maxRetries} intentos para invoice ${invoiceId}`;
  logger.error(errorMessage, lastError);
  throw new Error(`${errorMessage}: ${lastError.message}`);
}

module.exports = {
  getPaymentLink
};
