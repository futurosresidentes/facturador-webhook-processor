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

/**
 * Formatea teléfono para Callbell (sin + ni espacios)
 * Si es celular colombiano de 10 dígitos, agrega 57
 * @param {string} phone - Teléfono a formatear
 * @returns {string} Teléfono formateado
 */
function formatPhoneForCallbell(phone) {
  if (!phone) return '';

  // Limpiar espacios, + y guiones
  let cleanPhone = phone.toString().replace(/[\s\+\-\(\)]/g, '');

  // Si ya tiene 57 al inicio, retornar limpio
  if (cleanPhone.startsWith('57')) {
    return cleanPhone;
  }

  // Si es celular colombiano de 10 dígitos que empieza con 3
  if (/^3\d{9}$/.test(cleanPhone)) {
    return '57' + cleanPhone;
  }

  return cleanPhone;
}

/**
 * PASO 2.1: Enviar plantilla de confirmación de pago vía Callbell
 * @param {Object} data - Datos para la plantilla
 * @param {string} data.phone - Teléfono del cliente
 * @param {string} data.product - Nombre del producto
 * @param {string} data.amount - Monto pagado
 * @param {string} data.email - Email del cliente
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendPaymentTemplate(data) {
  try {
    const phoneFormatted = formatPhoneForCallbell(data.phone);

    logger.info(`[Callbell] Enviando plantilla de pago a: ${phoneFormatted}`);
    logger.info(`[Callbell] Producto: ${data.product}, Monto: ${data.amount}`);

    const payload = {
      to: phoneFormatted,
      from: 'whatsapp',
      type: 'text',
      content: {
        text: 'Pago'
      },
      template_values: [
        data.product,      // variable1: Nombre del producto
        data.amount,       // variable2: Valor del pago
        data.email         // variable3: Email
      ],
      template_uuid: '50d4ef2e9daa4da881345914e3c0e4f3',
      optin_contact: true
    };

    logger.info(`[Callbell] Payload:`, JSON.stringify(payload, null, 2));

    const response = await callbellClient.post('/messages/send', payload);

    logger.info(`[Callbell] ✅ Plantilla enviada exitosamente`);

    return {
      success: true,
      phone: phoneFormatted,
      messageId: response.data?.message?.uuid || response.data?.uuid || response.data?.id,
      sentAt: new Date().toISOString(),
      response: response.data
    };

  } catch (error) {
    logger.error('[Callbell] Error enviando plantilla:', error.response?.data || error.message);

    // No lanzar error para que no bloquee el proceso del webhook
    return {
      success: false,
      phone: data.phone,
      error: error.response?.data || error.message
    };
  }
}

module.exports = {
  notifyPaymentReceived,
  sendCustomMessage,
  sendPaymentTemplate,
  formatPhoneForCallbell
};
