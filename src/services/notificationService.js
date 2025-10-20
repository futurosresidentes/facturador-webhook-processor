const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Envía una notificación a Google Chat
 * @param {string} webhookUrl - URL del webhook de Google Chat
 * @param {string} message - Mensaje a enviar
 */
async function sendToGoogleChat(webhookUrl, message) {
  if (!webhookUrl) {
    logger.warn('[Notification] Google Chat webhook URL no configurada');
    return;
  }

  try {
    await axios.post(webhookUrl, { text: message }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    logger.info('[Notification] Notificación enviada a Google Chat');
  } catch (error) {
    logger.error('[Notification] Error enviando a Google Chat:', error.message);
  }
}

/**
 * Notifica un proceso exitoso
 * @param {Object} data - Datos del proceso exitoso
 */
async function notifySuccess(data) {
  const message = [
    '✅ *Webhook procesado exitosamente*\n',
    `Invoice ID: ${data.invoiceId}`,
    `Email: ${data.email}`,
    `Contacto CRM ID: ${data.contactCrmId}`,
    `Producto: ${data.product}`,
    `Monto: ${data.amount}`,
    `Activation URL: ${data.activationUrl || 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');

  await sendToGoogleChat(config.googleChat.successWebhook, message);
}

/**
 * Notifica un error durante el procesamiento
 * @param {Object} data - Datos del error
 */
async function notifyError(data) {
  const message = [
    '❌ *Error procesando webhook*\n',
    `Webhook Ref: ${data.webhookRef || 'N/A'}`,
    `Invoice ID: ${data.invoiceId || 'N/A'}`,
    `Error: ${data.error}`,
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');

  await sendToGoogleChat(config.googleChat.errorWebhook, message);
}

/**
 * Notifica un error de CRM
 * @param {string} title - Título del error
 * @param {Object} details - Detalles del error
 */
async function notifyCRMError(title, details) {
  const message = [
    `⚠️ *${title}*\n`,
    ...Object.entries(details).map(([key, value]) => `${key}: ${value}`),
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');

  await sendToGoogleChat(config.googleChat.crmErrorWebhook, message);
}

/**
 * Notifica proceso de membresías (Frapp)
 * @param {string} title - Título
 * @param {Object} details - Detalles
 */
async function notifyFrapp(title, details) {
  const message = [
    `🎯 *${title}*\n`,
    ...Object.entries(details).map(([key, value]) => `${key}: ${value}`),
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n');

  await sendToGoogleChat(config.googleChat.frappWebhook, message);
}

module.exports = {
  sendToGoogleChat,
  notifySuccess,
  notifyError,
  notifyCRMError,
  notifyFrapp
};
