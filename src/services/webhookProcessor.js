/**
 * Procesador de webhooks de ePayco
 * Maneja el flujo completo de procesamiento de pagos:
 * 1. Consulta datos del payment link en FR360
 * 2. Crea/actualiza contacto en CRM
 * 3. Crea membresías si el producto lo requiere
 * 4. Envía notificaciones de éxito/error
 */

const { Webhook, WebhookLog, Contact } = require('../models');
const fr360Service = require('./fr360Service');
const crmService = require('./crmService');
const membershipService = require('./membershipService');
const worldOfficeService = require('./worldOfficeService');
const notificationService = require('./notificationService');
const { requiresMemberships } = require('../utils/productFilter');
const config = require('../config/env');
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

    // NOTIFICACIÓN PASO 0: Webhook recibido
    await notificationService.notifyStep(0, 'WEBHOOK RECIBIDO', {
      'Ref Payco': webhook.ref_payco,
      'Invoice ID': webhook.invoice_id,
      'Email': webhook.customer_email,
      'Producto': webhook.product,
      'Monto': `$${webhook.amount} ${webhook.currency}`,
      'Ciudad': webhook.customer_city || 'N/A',
      'Dirección': webhook.customer_address || 'N/A',
      'Estado': 'Iniciando procesamiento...'
    });

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

    // NOTIFICACIÓN PASO 1: Invoice ID extraído
    await notificationService.notifyStep(1, 'EXTRACCIÓN INVOICE ID', {
      'Invoice ID completo': webhook.invoice_id,
      'Invoice ID extraído': invoiceId,
      'Resultado': '✅ Extracción exitosa'
    });

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

    // NOTIFICACIÓN PASO 2: Consulta FR360
    await notificationService.notifyStep(2, 'CONSULTA FR360', {
      'Invoice ID': invoiceId,
      'Producto': paymentLinkData.product,
      'Email': paymentLinkData.email,
      'Nombres': paymentLinkData.givenName,
      'Apellidos': paymentLinkData.familyName,
      'Cédula': paymentLinkData.identityDocument,
      'Teléfono': paymentLinkData.phone,
      'Comercial': paymentLinkData.salesRep,
      'Fecha de acceso': paymentLinkData.accessDate,
      'Resultado': '✅ Datos obtenidos exitosamente'
    });

    // STAGE 3: Verificar si el producto requiere creación de membresías
    const debeCrearMemberships = requiresMemberships(paymentLinkData.product);
    let membershipResult = null;

    if (debeCrearMemberships) {
      // Registrar creación de membresías
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'processing',
        details: `Creando membresías para producto: ${paymentLinkData.product}`
      });

      // Crear membresías en FR360 (sin contactId aún)
      // La notificación se envía DENTRO de membershipService.createMemberships()
      membershipResult = await membershipService.createMemberships({
        contactId: null, // Aún no tenemos contactId de CRM
        identityDocument: paymentLinkData.identityDocument,
        email: paymentLinkData.email,
        givenName: paymentLinkData.givenName,
        familyName: paymentLinkData.familyName,
        phone: paymentLinkData.phone,
        product: paymentLinkData.product,
        accessDate: paymentLinkData.accessDate,
        webhookId: webhookId
      });

      // membershipResult contiene: { activationUrl, etiquetas, membershipsCreadas }
      logger.info(`[Processor] Membresías procesadas. Activation URL: ${membershipResult.activationUrl || 'N/A'}`);
      logger.info(`[Processor] Etiquetas a aplicar: ${membershipResult.etiquetas.join(', ')}`);
      completedStages.memberships = true;

    } else {
      logger.info(`[Processor] Producto no requiere membresías: ${paymentLinkData.product}`);

      // NOTIFICACIÓN PASO 3: Sin membresías
      await notificationService.notifyStep(3, 'VERIFICACIÓN DE MEMBRESÍAS', {
        'Producto': paymentLinkData.product,
        'Requiere membresías': '❌ No',
        'Motivo': 'Cuota 2+ o producto no permitido',
        'Resultado': 'ℹ️ Se omite creación de membresías'
      });
    }

    // STAGE 4: Registrar búsqueda/creación de contacto en CRM
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'crm_upsert',
      status: 'processing',
      details: `Buscando o creando contacto en CRM: ${paymentLinkData.email}`
    });

    // Buscar o crear contacto en ActiveCampaign
    const crmResult = await crmService.createOrUpdateContact(paymentLinkData, webhook);
    const contact = crmResult.contact;
    const crmAction = crmResult.action;

    logger.info(`[Processor] Contacto ${crmAction} con CRM ID: ${contact.id}`);

    // Guardar en BD local (si no existe)
    let localContact = await Contact.findOne({ where: { email: paymentLinkData.email } });
    if (!localContact) {
      localContact = await Contact.create({
        crm_id: contact.id,
        email: paymentLinkData.email,
        name: `${paymentLinkData.givenName || ''} ${paymentLinkData.familyName || ''}`.trim(),
        phone: paymentLinkData.phone,
        identity_document: paymentLinkData.identityDocument
      });
      logger.info(`[Processor] Contacto guardado en BD local: ${localContact.id}`);
    }

    // Si hay activationUrl, actualizar en CRM
    if (membershipResult?.activationUrl) {
      await crmService.updateContact(contact.id, {
        activationUrl: membershipResult.activationUrl
      });
      logger.info(`[Processor] ActivationUrl actualizada en CRM`);
    }

    // Preparar descripción de etiquetas
    const ETIQUETAS_NOMBRES = {
      1172: 'Nueva Plataforma',
      1174: 'Élite 6 meses',
      1175: 'Élite 9 meses',
      1176: 'Élite 12 meses'
    };

    // Aplicar etiquetas solo en modo PRODUCCIÓN
    const etiquetasAplicadas = [];
    let etiquetasDetalle = 'N/A';
    let etiquetasLabel = 'Etiquetas aplicadas';

    if (membershipResult?.etiquetas && membershipResult.etiquetas.length > 0) {
      if (config.frapp.modoProduccion) {
        // MODO PRODUCCIÓN: Aplicar etiquetas realmente
        for (const tagId of membershipResult.etiquetas) {
          try {
            await crmService.addTagToContact(contact.id, tagId);
            logger.info(`[Processor] Etiqueta ${tagId} agregada al contacto`);
            etiquetasAplicadas.push(tagId);
          } catch (error) {
            logger.warn(`[Processor] Error agregando etiqueta ${tagId}: ${error.message}`);
          }
        }

        if (etiquetasAplicadas.length > 0) {
          etiquetasDetalle = etiquetasAplicadas
            .map(tagId => `${tagId} (${ETIQUETAS_NOMBRES[tagId] || 'Desconocida'})`)
            .join(', ');
        }
        etiquetasLabel = 'Etiquetas aplicadas';
      } else {
        // MODO TESTING: No aplicar, solo notificar cuáles se hubieran aplicado
        logger.info(`[Processor] 🟡 MODO TESTING: NO se aplican etiquetas, solo se muestran las que se aplicarían`);
        etiquetasDetalle = membershipResult.etiquetas
          .map(tagId => `${tagId} (${ETIQUETAS_NOMBRES[tagId] || 'Desconocida'})`)
          .join(', ');
        etiquetasLabel = 'Etiquetas que se aplicarían';
      }
    }

    completedStages.crm = true;

    // NOTIFICACIÓN PASO 4 COMPLETADA: CRM (solo una vez, al final)
    await notificationService.notifyStep(4, 'GESTIÓN CRM (ACTIVECAMPAIGN)', {
      'Email': paymentLinkData.email,
      'Acción': crmAction === 'created' ? '🆕 Contacto creado' : '🔄 Contacto actualizado',
      'CRM ID': contact.id,
      'Nombre': `${paymentLinkData.givenName} ${paymentLinkData.familyName}`,
      'Teléfono': paymentLinkData.phone,
      'Cédula': paymentLinkData.identityDocument,
      'ActivationUrl': membershipResult?.activationUrl ? '✅ Actualizada' : 'N/A',
      [etiquetasLabel]: etiquetasDetalle,
      'Resultado': '✅ Contacto gestionado exitosamente'
    });

    // STAGE 5: Buscar o crear cliente en World Office
    // Esto incluirá la búsqueda de ciudad en el caché
    logger.info(`[Processor] PASO 5: Gestionando cliente en World Office`);

    const woCustomerResult = await worldOfficeService.findOrUpdateCustomer({
      identityDocument: paymentLinkData.identityDocument,
      givenName: paymentLinkData.givenName,
      familyName: paymentLinkData.familyName,
      email: paymentLinkData.email,
      phone: paymentLinkData.phone,
      city: webhook.customer_city,
      address: webhook.customer_address,
      comercial: paymentLinkData.comercial
    });

    logger.info(`[Processor] Cliente WO: ${woCustomerResult.action} - ID ${woCustomerResult.customerId} | Comercial WO ID: ${woCustomerResult.comercialWOId}`);
    completedStages.worldoffice_customer = true;

    // NOTIFICACIÓN PASO 5: World Office
    const cityText = webhook.customer_city || 'N/A';
    const cityUsed = woCustomerResult.customerData?.cityName || 'N/A';

    // Determinar el texto de la acción
    let actionText = '❓ Acción desconocida';
    if (woCustomerResult.action === 'created') {
      actionText = '🆕 Cliente creado en WO';
    } else if (woCustomerResult.action === 'found') {
      actionText = '✅ Cliente ya existe en WO';
    }

    await notificationService.notifyStep(5, 'GESTIÓN CLIENTE WORLD OFFICE', {
      'Cédula': paymentLinkData.identityDocument,
      'Nombre completo': `${paymentLinkData.givenName} ${paymentLinkData.familyName}`,
      'Email': paymentLinkData.email,
      'Teléfono': paymentLinkData.phone,
      'Ciudad recibida': cityText,
      'Ciudad a usar en WO': `${cityUsed} (ID: ${woCustomerResult.customerData?.cityId || 'N/A'})`,
      'Dirección': webhook.customer_address || 'N/A',
      'Acción': actionText,
      '🆔 ID Cliente WO': woCustomerResult.customerId,
      'Comercial': paymentLinkData.comercial || 'N/A',
      '🆔 ID Comercial WO': woCustomerResult.comercialWOId,
      'Resultado': '✅ Cliente gestionado exitosamente'
    });

    // Preparar mensaje final según resultado
    const activationUrl = membershipResult?.activationUrl || null;
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
      contactCrmId: contact.id,
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
      memberships: membershipResult?.membershipsCreadas && membershipResult.membershipsCreadas.length > 0
        ? membershipResult.membershipsCreadas
        : undefined,

      // World Office
      worldOfficeCustomerId: woCustomerResult.customerId,

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
