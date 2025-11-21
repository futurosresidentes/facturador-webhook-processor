/**
 * Manejo de casos especiales de productos
 * Casos que no crean membresías pero necesitan notificación especial
 */

const axios = require('axios');
const logger = require('../config/logger');

// URL del webhook de Google Chat desde variables de entorno
const GOOGLE_CHAT_WEBHOOK = process.env.GOOGLE_CHAT_WEBHOOK_URL;

/**
 * Verifica si un producto es un caso especial
 * @param {string} producto - Nombre del producto
 * @returns {Object|null} - {type: 'cuota_extraordinaria' | 'elite_3_meses', producto} o null
 */
function isSpecialCase(producto) {
  if (!producto) return null;

  // Caso 1: Cuota extraordinaria
  if (producto.toLowerCase().includes('cuota extraordinaria')) {
    return {
      type: 'cuota_extraordinaria',
      producto
    };
  }

  // Caso 2: Élite - 3 meses
  if (producto.includes('Élite - 3 meses') || producto.includes('Elite - 3 meses')) {
    return {
      type: 'elite_3_meses',
      producto
    };
  }

  return null;
}

/**
 * Envía notificación a Google Chat para casos especiales
 * @param {Object} data - Datos del pago
 * @param {string} data.type - Tipo de caso especial
 * @param {string} data.producto - Nombre del producto
 * @param {string} data.customerName - Nombre del cliente
 * @param {string} data.email - Email del cliente
 * @param {string} data.phone - Teléfono del cliente
 * @param {string} data.identityDocument - Cédula del cliente
 * @param {string} data.amount - Monto pagado
 * @param {string} data.refPayco - Referencia de ePayco
 * @returns {Promise<Object>}
 */
async function notifySpecialCase(data) {
  try {
    let title, description;

    if (data.type === 'cuota_extraordinaria') {
      title = '⚠️ PAGO EXTRAORDINARIO RECIBIDO';
      description = `Se recibió un pago de cuota extraordinaria que requiere atención manual.`;
    } else if (data.type === 'elite_3_meses') {
      title = 'ℹ️ PAGO ÉLITE 3 MESES RECIBIDO';
      description = `Se recibió un pago de Élite 3 meses que no genera membresías automáticas.`;
    } else {
      title = '⚠️ CASO ESPECIAL DETECTADO';
      description = `Se recibió un pago que requiere atención manual.`;
    }

    const message = {
      text: `${title}\n\n${description}\n\n` +
            `📦 *Producto:* ${data.producto}\n` +
            `👤 *Cliente:* ${data.customerName}\n` +
            `📧 *Email:* ${data.email}\n` +
            `📱 *Teléfono:* ${data.phone}\n` +
            `🆔 *Cédula:* ${data.identityDocument}\n` +
            `💰 *Monto:* ${data.amount}\n` +
            `🔖 *Ref ePayco:* ${data.refPayco}\n\n` +
            `*ACCIÓN REQUERIDA:* Este pago no genera membresías automáticas. ` +
            `Por favor, gestiona las membresías manualmente si es necesario.`
    };

    const response = await axios.post(GOOGLE_CHAT_WEBHOOK, message, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info(`[SpecialCase] Notificación enviada a Google Chat para caso: ${data.type}`);

    return {
      success: true,
      type: data.type,
      sentAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[SpecialCase] Error enviando notificación a Google Chat:', error.message);

    // No lanzar error - la notificación no debe bloquear el proceso
    return {
      success: false,
      type: data.type,
      error: error.message,
      sentAt: new Date().toISOString()
    };
  }
}

module.exports = {
  isSpecialCase,
  notifySpecialCase
};
