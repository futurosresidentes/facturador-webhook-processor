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
 * Notifica un proceso exitoso con resumen completo del recorrido
 * @param {Object} data - Datos del proceso exitoso
 * @param {string} data.invoiceId - ID del invoice
 * @param {string} data.email - Email del cliente
 * @param {string} data.contactCrmId - ID del contacto en CRM
 * @param {string} data.product - Producto adquirido
 * @param {string} data.amount - Monto del pago
 * @param {string} data.activationUrl - URL de activación
 * @param {Object} data.stages - Objeto con información de cada stage procesado
 * @param {Object} data.customerData - Datos del cliente (nombres, cédula, ciudad, etc.)
 * @param {Object} data.crmAction - Acción realizada en CRM ('created' o 'updated')
 * @param {Array} data.memberships - Array de membresías creadas
 * @param {number} data.totalRetries - Total de reintentos realizados
 * @param {number} data.processingTimeMs - Tiempo total de procesamiento en ms
 */
async function notifySuccess(data) {
  const messageParts = [
    '✅ *Webhook procesado exitosamente*\n',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '*📋 INFORMACIÓN GENERAL*',
    `• Ref Payco: ${data.webhookRef || 'N/A'}`,
    `• Invoice ID: ${data.invoiceId}`,
    `• Email: ${data.email}`,
    `• Producto: ${data.product}`,
    `• Monto: $${data.amount} COP`,
    ''
  ];

  // Customer data section
  if (data.customerData) {
    messageParts.push('*👤 DATOS DEL CLIENTE*');
    if (data.customerData.nombres) messageParts.push(`• Nombres: ${data.customerData.nombres}`);
    if (data.customerData.apellidos) messageParts.push(`• Apellidos: ${data.customerData.apellidos}`);
    if (data.customerData.cedula) messageParts.push(`• Cédula: ${data.customerData.cedula}`);
    if (data.customerData.telefono) messageParts.push(`• Teléfono: ${data.customerData.telefono}`);
    if (data.customerData.ciudad) messageParts.push(`• Ciudad: ${data.customerData.ciudad}`);
    if (data.customerData.direccion) messageParts.push(`• Dirección: ${data.customerData.direccion}`);
    if (data.customerData.comercial) messageParts.push(`• Comercial: ${data.customerData.comercial}`);
    messageParts.push('');
  }

  // Processing stages section
  messageParts.push('*🔄 RECORRIDO DE PROCESAMIENTO*');

  if (data.stages) {
    if (data.stages.invoice_extraction) {
      messageParts.push(`✓ 1. Extracción Invoice ID: ${data.invoiceId}`);
    }

    if (data.stages.fr360_query) {
      messageParts.push(`✓ 2. Consulta FR360: Exitosa`);
    }

    if (data.stages.memberships && data.memberships) {
      messageParts.push(`✓ 3. Membresías (Frapp): ${data.memberships.length} creada(s)`);
      data.memberships.forEach((membership, idx) => {
        messageParts.push(`  - ${membership.name || `Membresía ${idx + 1}`}: ${membership.status || 'Activa'}`);
      });
    }

    if (data.stages.crm) {
      const action = data.crmAction === 'created' ? 'Creado' : 'Actualizado';
      messageParts.push(`✓ 4. CRM (ActiveCampaign): ${action} - ID ${data.contactCrmId}`);
    }

    if (data.stages.worldoffice_customer) {
      messageParts.push(`✓ 5. World Office - Cliente: ${data.worldOfficeCustomerId || 'Creado/Actualizado'}`);
    }

    if (data.stages.worldoffice_invoice) {
      messageParts.push(`✓ 6. World Office - Factura: ${data.invoice?.numeroFactura || 'Creada'}`);
    }

    if (data.stages.worldoffice_accounting) {
      messageParts.push(`✓ 7. World Office - Contabilización: ${data.invoice?.contabilizado ? 'Exitosa' : 'Procesada'}`);
    }

    if (data.stages.worldoffice_dian) {
      const dianInfo = data.invoice?.dian;
      if (dianInfo?.skipped) {
        messageParts.push(`✓ 8. World Office - Emisión DIAN: Desactivada`);
      } else if (dianInfo?.warning) {
        messageParts.push(`⚠️ 8. World Office - Emisión DIAN: Ya emitida previamente`);
      } else {
        messageParts.push(`✓ 8. World Office - Emisión DIAN: ${dianInfo?.cufe || 'Emitida'}`);
      }
    }

    if (data.stages.callbell) {
      messageParts.push(`✓ 9. Notificación Callbell: Enviada`);
    }

    if (data.stages.strapi) {
      messageParts.push(`✓ 10. Strapi - Guardar Venta: ID ${data.strapiSaleId || 'Guardada'}`);
    }
  }

  messageParts.push('');

  // Invoice details section (if invoice was created)
  if (data.invoice) {
    messageParts.push('*📄 FACTURACIÓN*');
    messageParts.push(`• Número de factura: ${data.invoice.numeroFactura}`);
    messageParts.push(`• Documento ID: ${data.invoice.documentoId}`);
    messageParts.push(`• Monto: $${data.invoice.monto?.toLocaleString('es-CO') || 'N/A'} COP`);

    const modoFactura = data.invoice.simulado ? '🟡 TESTING (simulada)' : '🟢 PRODUCCIÓN (real)';
    messageParts.push(`• Modo: ${modoFactura}`);

    messageParts.push(`• Contabilizada: ${data.invoice.contabilizado ? '✅ Sí' : '❌ No'}`);

    if (data.invoice.dian) {
      if (data.invoice.dian.skipped) {
        messageParts.push(`• Emisión DIAN: 🔴 Desactivada por configuración`);
      } else if (data.invoice.dian.warning) {
        messageParts.push(`• Emisión DIAN: ⚠️ Ya emitida previamente`);
        if (data.invoice.dian.cufe && data.invoice.dian.cufe !== 'N/A') {
          messageParts.push(`• CUFE: ${data.invoice.dian.cufe}`);
        }
      } else {
        messageParts.push(`• Emisión DIAN: ✅ ${data.invoice.dian.status || 'Emitida'}`);
        if (data.invoice.dian.cufe && data.invoice.dian.cufe !== 'N/A') {
          messageParts.push(`• CUFE: ${data.invoice.dian.cufe}`);
        }
      }
    }

    messageParts.push('');
  }

  // Activation URL section
  if (data.activationUrl) {
    messageParts.push('*🔗 ACTIVACIÓN*');
    messageParts.push(`• URL: ${data.activationUrl}`);
    messageParts.push('');
  }

  // Performance metrics section
  messageParts.push('*📊 MÉTRICAS*');
  if (data.totalRetries !== undefined && data.totalRetries > 0) {
    messageParts.push(`• Total de reintentos: ${data.totalRetries}`);
  }
  if (data.processingTimeMs) {
    const seconds = (data.processingTimeMs / 1000).toFixed(2);
    messageParts.push(`• Tiempo de procesamiento: ${seconds}s`);
  }
  messageParts.push(`• Timestamp: ${new Date().toISOString()}`);

  const message = messageParts.join('\n');
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

/**
 * Notifica paso a paso del procesamiento (para debugging detallado)
 * @param {number} step - Número del paso (1-10)
 * @param {string} title - Título del paso
 * @param {Object} data - Datos a mostrar
 * @param {number} durationMs - Duración del paso en milisegundos (opcional)
 */
async function notifyStep(step, title, data = {}, durationMs = null) {
  const emojis = {
    1: '📝',
    2: '🔍',
    3: '👥',
    4: '🎯',
    5: '📞',
    6: '🏢',
    7: '📄',
    8: '💼',
    9: '📧',
    10: '💾'
  };

  const emoji = emojis[step] || '▶️';

  const messageParts = [
    `${emoji} *PASO ${step}: ${title}*`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];

  // Agregar datos si existen
  if (Object.keys(data).length > 0) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        // Si es un objeto o array, convertir a JSON formateado
        if (typeof value === 'object') {
          messageParts.push(`*${key}:*`);
          messageParts.push('```');
          messageParts.push(JSON.stringify(value, null, 2));
          messageParts.push('```');
        } else {
          messageParts.push(`• *${key}:* ${value}`);
        }
      }
    }
  }

  messageParts.push('');

  // Agregar timestamp con duración si está disponible
  const timestamp = new Date().toISOString();
  if (durationMs !== null) {
    const durationSeconds = (durationMs / 1000).toFixed(2);
    messageParts.push(`⏱️ ${timestamp} (${durationSeconds}s)`);
  } else {
    messageParts.push(`⏱️ ${timestamp}`);
  }

  const message = messageParts.join('\n');
  await sendToGoogleChat(config.googleChat.successWebhook, message);
}

module.exports = {
  sendToGoogleChat,
  notifySuccess,
  notifyError,
  notifyCRMError,
  notifyFrapp,
  notifyStep
};
