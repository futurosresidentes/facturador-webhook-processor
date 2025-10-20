const { Webhook, WebhookLog } = require('../models');
const fr360Service = require('./fr360Service');
const crmService = require('./crmService');
const membershipService = require('./membershipService');
const notificationService = require('./notificationService');
const { requiresMemberships } = require('../utils/productFilter');
const logger = require('../config/logger');

/**
 * Procesa un webhook completo
 * @param {number} webhookId - ID del webhook en la base de datos
 */
async function processWebhook(webhookId) {
  let webhook;

  try {
    // 1. Obtener webhook de BD
    webhook = await Webhook.findByPk(webhookId);

    if (!webhook) {
      throw new Error(`Webhook ${webhookId} no encontrado`);
    }

    logger.info(`[Processor] Procesando webhook ${webhook.ref_payco}`);

    // Crear log inicial
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'started',
      status: 'processing',
      details: 'Iniciando procesamiento del webhook'
    });

    // Actualizar estado del webhook
    await webhook.update({ status: 'processing', updated_at: new Date() });

    // 2. Extraer invoiceId
    const invoiceId = webhook.invoice_id.split('-')[0];

    logger.info(`[Processor] Invoice ID extraído: ${invoiceId}`);

    // Log: Consultando FR360
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'fr360_query',
      status: 'processing',
      details: `Consultando invoice ${invoiceId} en FR360 API`
    });

    // 3. Consultar FR360
    const paymentLinkData = await fr360Service.getPaymentLink(invoiceId);

    logger.info(`[Processor] Payment link obtenido para invoice ${invoiceId}`);
    logger.info(`[Processor] Producto: ${paymentLinkData.product}`);
    logger.info(`[Processor] Email: ${paymentLinkData.email}`);

    // Log: Buscando en CRM
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'crm_upsert',
      status: 'processing',
      details: `Buscando o creando contacto en CRM: ${paymentLinkData.email}`
    });

    // 4. Buscar o crear en CRM
    const contact = await crmService.findOrCreateContact(paymentLinkData);

    logger.info(`[Processor] Contacto procesado con CRM ID: ${contact.crm_id}`);

    // 5. Verificar si debe crear membresías
    const debeCrearMemberships = requiresMemberships(paymentLinkData.product);

    let activationUrl = null;

    if (debeCrearMemberships) {
      // Log: Creando membresías
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'processing',
        details: `Creando membresías para producto: ${paymentLinkData.product}`
      });

      // Crear membresías
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

    } else {
      logger.info(`[Processor] Producto no requiere membresías: ${paymentLinkData.product}`);
    }

    // 6. Actualizar estado final
    const finalDetails = debeCrearMemberships && activationUrl
      ? `Completado exitosamente. Producto: ${paymentLinkData.product} | Membresías creadas | URL: ${activationUrl}`
      : `Completado. Producto: ${paymentLinkData.product} | NO requiere membresías (Cuota 2+, producto no permitido, etc.)`;

    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'completed',
      status: 'success',
      details: finalDetails
    });

    await webhook.update({
      status: 'completed',
      updated_at: new Date()
    });

    // 7. Notificar éxito
    await notificationService.notifySuccess({
      invoiceId,
      email: paymentLinkData.email,
      contactCrmId: contact.crm_id,
      product: paymentLinkData.product,
      amount: `${webhook.amount} ${webhook.currency}`,
      activationUrl: activationUrl || 'N/A'
    });

    logger.info(`[Processor] Webhook ${webhook.ref_payco} procesado exitosamente`);

    return {
      success: true,
      webhookId,
      refPayco: webhook.ref_payco,
      contact,
      activationUrl
    };

  } catch (error) {
    logger.error(`[Processor] Error procesando webhook ${webhookId}:`, error);

    // Registrar error en log
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'error',
      status: 'failed',
      details: 'Error durante el procesamiento',
      error_message: error.toString()
    });

    // Actualizar estado del webhook
    if (webhook) {
      await webhook.update({
        status: 'error',
        updated_at: new Date()
      });
    }

    // Notificar error
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
