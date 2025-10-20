/**
 * Callbell Service
 * Maneja las notificaciones a clientes vía Callbell (WhatsApp)
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// Configuración de axios para Callbell
const callbellClient = axios.create({
  baseURL: config.callbell?.apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.callbell?.apiKey}`
  }
});

/**
 * PASO 5: Notificar al cliente que su pago fue recibido
 * @param {Object} notificationData - Datos de la notificación
 * @param {string} notificationData.phone - Teléfono del cliente (con código de país)
 * @param {string} notificationData.customerName - Nombre del cliente
 * @param {string} notificationData.product - Producto comprado
 * @param {string} notificationData.amount - Monto pagado
 * @param {string} notificationData.activationUrl - URL de activación de membresías
 * @returns {Promise<Object>} notificationSent
 */
async function notifyPaymentReceived(notificationData) {
  try {
    logger.info(`[Callbell] Enviando notificación a: ${notificationData.phone}`);

    // Construir mensaje personalizado
    const message = buildPaymentMessage(notificationData);

    // TODO: Implementar envío vía Callbell
    // const response = await callbellClient.post('/messages/send', {
    //   phone: notificationData.phone,
    //   message: message,
    //   channel: 'whatsapp'
    // });

    // MOCK - Remover cuando implementes la API real
    logger.warn('[Callbell] MODO MOCK - Notificación simulada');
    logger.info(`[Callbell] Mensaje que se enviaría:\n${message}`);

    return {
      notificationSent: true,
      phone: notificationData.phone,
      messageId: 'CALLBELL_MSG_' + Date.now(),
      sentAt: new Date().toISOString(),
      status: 'sent_mock'
    };

  } catch (error) {
    logger.error('[Callbell] Error en notifyPaymentReceived:', error);
    throw new Error(`Error enviando notificación vía Callbell: ${error.message}`);
  }
}

/**
 * Construir mensaje personalizado de confirmación de pago
 * @private
 */
function buildPaymentMessage(data) {
  let message = `🎉 ¡Hola ${data.customerName}!\n\n`;
  message += `✅ Hemos recibido tu pago exitosamente.\n\n`;
  message += `📦 *Producto:* ${data.product}\n`;
  message += `💰 *Monto:* ${data.amount}\n\n`;

  if (data.activationUrl && data.activationUrl !== 'N/A') {
    message += `🔑 *¡Tus membresías están activadas!*\n\n`;
    message += `Activa tu cuenta aquí:\n${data.activationUrl}\n\n`;
  }

  message += `Gracias por confiar en nosotros. ¡Bienvenido! 🚀\n\n`;
  message += `_Si tienes alguna pregunta, responde a este mensaje._`;

  return message;
}

/**
 * Enviar notificación personalizada
 * @param {string} phone - Teléfono del cliente
 * @param {string} message - Mensaje a enviar
 * @returns {Promise<Object>}
 */
async function sendCustomMessage(phone, message) {
  try {
    logger.info(`[Callbell] Enviando mensaje personalizado a: ${phone}`);

    // TODO: Implementar envío personalizado
    // const response = await callbellClient.post('/messages/send', {
    //   phone,
    //   message,
    //   channel: 'whatsapp'
    // });

    // MOCK
    logger.warn('[Callbell] MODO MOCK - Mensaje personalizado simulado');
    return {
      notificationSent: true,
      phone,
      messageId: 'CALLBELL_CUSTOM_' + Date.now(),
      sentAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[Callbell] Error en sendCustomMessage:', error);
    throw new Error(`Error enviando mensaje personalizado: ${error.message}`);
  }
}

module.exports = {
  notifyPaymentReceived,
  sendCustomMessage
};
