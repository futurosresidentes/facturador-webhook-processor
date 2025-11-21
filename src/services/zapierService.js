/**
 * Zapier Service
 * Maneja el reenvío de webhooks a Zapier para que otras áreas de la empresa los aprovechen
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// URL del webhook de Zapier desde variables de entorno
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

/**
 * PASO 8: Reenviar webhook a Zapier
 * @param {Object} webhookData - Datos del webhook original de ePayco
 * @returns {Promise<Object>} resultado del reenvío
 */
async function forwardToZapier(webhookData) {
  try {
    logger.info(`[Zapier] Reenviando webhook a Zapier: ${webhookData.x_ref_payco}`);

    // Reenviar el webhook original completo a Zapier
    const response = await axios.post(ZAPIER_WEBHOOK_URL, webhookData, {
      timeout: 10000, // 10 segundos timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info(`[Zapier] ✅ Webhook reenviado exitosamente a Zapier`);
    logger.info(`[Zapier] Response status: ${response.status}`);

    return {
      success: true,
      status: response.status,
      data: response.data,
      sentAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[Zapier] Error reenviando webhook a Zapier:', error.message);

    // No lanzar error - el reenvío a Zapier no debe bloquear el proceso principal
    return {
      success: false,
      error: error.message,
      sentAt: new Date().toISOString()
    };
  }
}

module.exports = {
  forwardToZapier
};
