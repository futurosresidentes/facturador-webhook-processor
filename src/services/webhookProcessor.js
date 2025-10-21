/**
 * Procesador de webhooks de ePayco
 * Maneja el flujo completo de procesamiento de pagos:
 * 1. Consulta datos del payment link en FR360
 * 2. Crea/actualiza contacto en CRM
 * 3. Crea membresías si el producto lo requiere
 * 4. Envía notificaciones de éxito/error
 */

const { Webhook, WebhookLog } = require('../models');
const fr360Service = require('./fr360Service');
const crmService = require('./crmService');
const membershipService = require('./membershipService');
const notificationService = require('./notificationService');
const { requiresMemberships } = require('../utils/productFilter');
const logger = require('../config/logger');

/**
 * Procesa un webhook de pago de ePayco
 * @param {number} webhookId - ID del webhook en la base de datos
 * @returns {Promise<Object>} Resultado del procesamiento con datos del contacto y URL de activación
 * @throws {Error} Si ocurre algún error durante el procesamiento
 */
async function processWebhook(webhookId) {
  let webhook;
  const startTime = Date.now(); // Capturar tiempo de inicio
  const completedStages = {}; // Rastrear stages completados
  let totalRetries = 0; // Contador de reintentos

  try {
    // Buscar el webhook en la base de datos
    webhook = await Webhook.findByPk(webhookId);

    if (!webhook) {
      throw new Error(`Webhook ${webhookId} no encontrado`);
    }

    logger.info(`[Processor] Procesando webhook ${webhook.ref_payco}`);

    // Registrar inicio del procesamiento
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'started',
      status: 'processing',
      details: 'Iniciando procesamiento del webhook'
    });

    // Actualizar estado del webhook a "procesando"
    await webhook.update({ status: 'processing', updated_at: new Date() });

    // STAGE 1: Extraer el invoice ID (antes del guión)
    const invoiceId = webhook.invoice_id.split('-')[0];
    logger.info(`[Processor] Invoice ID extraído: ${invoiceId}`);
    completedStages.invoice_extraction = true;

    // STAGE 2: Registrar consulta a FR360
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'fr360_query',
      status: 'processing',
      details: `Consultando invoice ${invoiceId} en FR360 API`
    });

    // Obtener datos del payment link desde FR360
    const paymentLinkData = await fr360Service.getPaymentLink(invoiceId);

    logger.info(`[Processor] Payment link obtenido para invoice ${invoiceId}`);
    logger.info(`[Processor] Producto: ${paymentLinkData.product}`);
    logger.info(`[Processor] Email: ${paymentLinkData.email}`);
    completedStages.fr360_query = true;

    // STAGE 3: Registrar búsqueda/creación de contacto en CRM
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'crm_upsert',
      status: 'processing',
      details: `Buscando o creando contacto en CRM: ${paymentLinkData.email}`
    });

    // Buscar o crear contacto en ActiveCampaign
    const contact = await crmService.findOrCreateContact(paymentLinkData);
    logger.info(`[Processor] Contacto procesado con CRM ID: ${contact.crm_id}`);
    completedStages.crm = true;

    // El crmService actual no devuelve si fue creado o actualizado
    // Por ahora asumiremos que siempre es 'updated' hasta migrar a crmService.v2.js
    const crmAction = 'updated';

    // STAGE 4: Verificar si el producto requiere creación de membresías
    const debeCrearMemberships = requiresMemberships(paymentLinkData.product);
    let activationUrl = null;
    let memberships = [];

    if (debeCrearMemberships) {
      // Registrar creación de membresías
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'processing',
        details: `Creando membresías para producto: ${paymentLinkData.product}`
      });

      // Crear membresías en FR360
      activationUrl = await membershipService.createMemberships({
        contactId: contact.id,
        identityDocument: paymentLinkData.identityDocument,
        email: paymentLinkData.email,
        givenName: paymentLinkData.givenName,
        familyName: paymentLinkData.familyName,
        phone: paymentLinkData.phone,
        product: paymentLinkData.product,
        accessDate: paymentLinkData.accessDate,
        webhookId: webhookId
      });

      logger.info(`[Processor] Membresías procesadas. Activation URL: ${activationUrl || 'N/A'}`);
      completedStages.memberships = true;

      // Construir array de membresías (el servicio actual no devuelve esta info, inferimos del producto)
      memberships = [
        { name: paymentLinkData.product, status: 'Activa' }
      ];
    } else {
      logger.info(`[Processor] Producto no requiere membresías: ${paymentLinkData.product}`);
    }

    // Preparar mensaje final según resultado
    const finalDetails = debeCrearMemberships && activationUrl
      ? `Completado exitosamente. Producto: ${paymentLinkData.product} | Membresías creadas | URL: ${activationUrl}`
      : `Completado. Producto: ${paymentLinkData.product} | NO requiere membresías (Cuota 2+, producto no permitido, etc.)`;

    // Registrar finalización exitosa
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'completed',
      status: 'success',
      details: finalDetails
    });

    // Actualizar webhook como completado
    await webhook.update({
      status: 'completed',
      updated_at: new Date()
    });

    // Calcular tiempo total de procesamiento
    const processingTimeMs = Date.now() - startTime;

    // Enviar notificación de éxito con resumen completo
    await notificationService.notifySuccess({
      webhookRef: webhook.ref_payco,
      invoiceId,
      email: paymentLinkData.email,
      contactCrmId: contact.crm_id,
      product: paymentLinkData.product,
      amount: webhook.amount,
      activationUrl: activationUrl,

      // Datos del cliente
      customerData: {
        nombres: paymentLinkData.givenName,
        apellidos: paymentLinkData.familyName,
        cedula: paymentLinkData.identityDocument,
        telefono: paymentLinkData.phone,
        ciudad: webhook.customer_city,
        direccion: webhook.customer_address,
        comercial: paymentLinkData.salesRep
      },

      // Acción realizada en CRM
      crmAction: crmAction,

      // Stages completados
      stages: completedStages,

      // Membresías creadas
      memberships: memberships.length > 0 ? memberships : undefined,

      // Métricas de performance
      totalRetries: totalRetries,
      processingTimeMs: processingTimeMs
    });

    logger.info(`[Processor] Webhook ${webhook.ref_payco} procesado exitosamente en ${(processingTimeMs / 1000).toFixed(2)}s`);

    // Retornar resultado del procesamiento
    return {
      success: true,
      webhookId,
      refPayco: webhook.ref_payco,
      contact,
      activationUrl
    };

  } catch (error) {
    logger.error(`[Processor] Error procesando webhook ${webhookId}:`, error);

    // Registrar error en el log
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'error',
      status: 'failed',
      details: 'Error durante el procesamiento',
      error_message: error.toString()
    });

    // Actualizar webhook con estado de error
    if (webhook) {
      await webhook.update({
        status: 'error',
        updated_at: new Date()
      });
    }

    // Enviar notificación de error
    await notificationService.notifyError({
      webhookRef: webhook?.ref_payco,
      invoiceId: webhook?.invoice_id,
      error: error.toString()
    });

    throw error;
  }
}

module.exports = {
  processWebhook
};
