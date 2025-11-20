/**
 * Procesador de webhooks de ePayco
 * Maneja el flujo completo de procesamiento de pagos:
 * 1. Consulta datos del payment link en FR360
 * 2. Crea/actualiza contacto en CRM
 * 3. Crea membresías si el producto lo requiere
 * 4. Envía notificaciones de éxito/error
 */

const axios = require('axios');
const { Webhook, WebhookLog, Contact } = require('../models');
const FeatureFlag = require('../models/FeatureFlag');
const fr360Service = require('./fr360Service');
const crmService = require('./crmService');
const membershipService = require('./membershipService');
const callbellService = require('./callbellService');
const worldOfficeService = require('./worldOfficeService');
const notificationService = require('./notificationService');
const strapiCache = require('./strapiCache');
const strapiCarteraService = require('./strapiCarteraService');
const { requiresMemberships, getProductBase } = require('../utils/productFilter');
const { toColombiaISO } = require('../utils/dateUtils');
const { isRetriableError, getErrorDetails, getErrorContext } = require('../utils/errorClassifier');
const { isSpecialCase, notifySpecialCase } = require('../utils/specialCases');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Marcar el inicio de un stage (actualiza current_stage en BD)
 * Esto permite saber en qué stage falló si ocurre un error
 * @param {Object} webhook - Instancia del webhook
 * @param {string} stageName - Nombre del stage que está iniciando
 */
async function markStageStart(webhook, stageName) {
  const webhookId = webhook.id;

  // Actualizar current_stage en BD
  const { Webhook } = require('../models');
  await Webhook.update(
    {
      current_stage: stageName,
      updated_at: new Date()
    },
    {
      where: { id: webhookId }
    }
  );

  // Recargar para reflejar el cambio
  await webhook.reload();

  logger.info(`[Stage] 🔄 Iniciando stage: ${stageName}`);
}

/**
 * Guarda el checkpoint de un stage completado
 * IMPORTANTE: Los checkpoints se guardan INMEDIATAMENTE en la BD usando reload()
 * para asegurar que persistan incluso si un stage posterior falla.
 *
 * @param {Object} webhook - Instancia del webhook
 * @param {string} stageName - Nombre del stage completado
 * @param {Object} data - Datos a guardar en el contexto
 */
async function saveCheckpoint(webhook, stageName, data = {}) {
  const webhookId = webhook.id;

  // PASO 1: Recargar webhook para obtener valores más recientes
  await webhook.reload();

  const context = webhook.processing_context || {};
  const completedStages = webhook.completed_stages || [];

  // PASO 2: Guardar datos del stage en el contexto
  context[stageName] = {
    completed_at: new Date().toISOString(),
    data
  };

  // PASO 3: Agregar stage a la lista de completados (si no existe ya)
  if (!completedStages.includes(stageName)) {
    completedStages.push(stageName);
  }

  // PASO 4: Actualizar directamente en BD usando Webhook.update()
  // Esto garantiza que los checkpoints se persistan INMEDIATAMENTE, incluso si hay error después
  const { Webhook } = require('../models');
  const [updateCount] = await Webhook.update(
    {
      processing_context: context,
      completed_stages: completedStages,
      last_completed_stage: stageName,
      updated_at: new Date()
    },
    {
      where: { id: webhookId }
    }
  );

  // PASO 5: Recargar webhook para reflejar los cambios en la instancia actual
  await webhook.reload();

  logger.info(`[Checkpoint] ✅ Stage '${stageName}' guardado en BD (${updateCount} row(s), total completados: ${completedStages.length})`);
}

/**
 * Verifica si un stage ya fue completado previamente
 * @param {Object} webhook - Instancia del webhook
 * @param {string} stageName - Nombre del stage a verificar
 * @returns {boolean} - true si el stage ya está completado
 */
function isStageCompleted(webhook, stageName) {
  const completedStages = webhook.completed_stages || [];
  return completedStages.includes(stageName);
}

/**
 * Obtiene datos guardados de un stage completado
 * @param {Object} webhook - Instancia del webhook
 * @param {string} stageName - Nombre del stage
 * @returns {Object|null} - Datos del stage o null si no existe
 */
function getStageData(webhook, stageName) {
  const context = webhook.processing_context || {};
  return context[stageName]?.data || null;
}

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
  const stepTimestamps = {}; // Guardar timestamps de inicio de cada paso

  try {
    // Buscar el webhook en la base de datos
    webhook = await Webhook.findByPk(webhookId);

    if (!webhook) {
      throw new Error(`Webhook ${webhookId} no encontrado`);
    }

    logger.info(`[Processor] Procesando webhook ${webhook.ref_payco}`);

    // Verificar si hay checkpoints previos
    const hasCheckpoints = webhook.completed_stages && webhook.completed_stages.length > 0;
    if (hasCheckpoints) {
      logger.info(`[Processor] ✅ Detectados checkpoints previos. Stages completados: ${webhook.completed_stages.join(', ')}`);
      logger.info(`[Processor] 🔄 Se saltarán stages ya completados`);
    }

    // NOTIFICACIÓN PASO 0: Webhook recibido
    await notificationService.notifyStep(0, 'WEBHOOK RECIBIDO', {
      'Ref Payco': webhook.ref_payco,
      'Invoice ID': webhook.invoice_id,
      'Email': webhook.customer_email,
      'Producto': webhook.product,
      'Monto': `$${webhook.amount} ${webhook.currency}`,
      'Ciudad': webhook.customer_city || 'N/A',
      'Dirección': webhook.customer_address || 'N/A',
      'Estado': hasCheckpoints ? 'Reanudando procesamiento...' : 'Iniciando procesamiento...'
    });

    // Registrar inicio del procesamiento
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'started',
      status: 'processing',
      details: hasCheckpoints ? 'Reanudando procesamiento desde checkpoints' : 'Iniciando procesamiento del webhook'
    });

    // Actualizar estado del webhook a "procesando"
    await webhook.update({ status: 'processing', updated_at: new Date() });

    // STAGE 1: Extraer el invoice ID (antes del guión)
    let invoiceId;

    if (isStageCompleted(webhook, 'invoice_extraction')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'invoice_extraction');
      invoiceId = stageData.invoice_id;
      logger.info(`[Processor] ⏭️ SKIP invoice_extraction - Cargado desde checkpoint: ${invoiceId}`);
      completedStages.invoice_extraction = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'invoice_extraction');

      // Ejecutar stage
      stepTimestamps.paso1 = Date.now();
      invoiceId = webhook.invoice_id.split('-')[0];
      logger.info(`[Processor] Invoice ID extraído: ${invoiceId}`);
      completedStages.invoice_extraction = true;

      // LOG PASO 1: Invoice ID extraído
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'invoice_extraction',
        status: 'success',
        details: `Invoice ID extraído: ${invoiceId} (de ${webhook.invoice_id})`
      });

      // CHECKPOINT 1: Guardar invoice_id extraído
      await saveCheckpoint(webhook, 'invoice_extraction', {
        invoice_id: invoiceId,
        invoice_id_full: webhook.invoice_id
      });

      // NOTIFICACIÓN PASO 1: Invoice ID extraído
      const paso1Duration = Date.now() - stepTimestamps.paso1;
      await notificationService.notifyStep(1, 'EXTRACCIÓN INVOICE ID', {
        'Invoice ID completo': webhook.invoice_id,
        'Invoice ID extraído': invoiceId,
        'Resultado': '✅ Extracción exitosa'
      }, paso1Duration);
    }

    // STAGE 2: Consultar FR360
    let paymentLinkData;

    if (isStageCompleted(webhook, 'fr360_query')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'fr360_query');
      paymentLinkData = stageData.paymentLink;
      logger.info(`[Processor] ⏭️ SKIP fr360_query - Cargado desde checkpoint: ${paymentLinkData.product}`);
      completedStages.fr360_query = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'fr360_query');

      // Ejecutar stage
      stepTimestamps.paso2 = Date.now();
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'fr360_query',
        status: 'processing',
        details: `Consultando invoice ${invoiceId} en FR360 API`
      });

      // Obtener datos del payment link desde FR360
      paymentLinkData = await fr360Service.getPaymentLink(invoiceId);

      logger.info(`[Processor] Payment link obtenido para invoice ${invoiceId}`);
      logger.info(`[Processor] Producto: ${paymentLinkData.product}`);
      logger.info(`[Processor] Email: ${paymentLinkData.email}`);
      completedStages.fr360_query = true;

      // LOG PASO 2: Consulta FR360 exitosa
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'fr360_query',
        status: 'success',
        details: `Datos obtenidos de FR360 - Producto: ${paymentLinkData.product}, Email: ${paymentLinkData.email}, Cliente: ${paymentLinkData.givenName} ${paymentLinkData.familyName}, Cédula: ${paymentLinkData.identityDocument}, Comercial: ${paymentLinkData.salesRep || 'N/A'}`,
        request_payload: { invoiceId },
        response_data: paymentLinkData
      });

      // CHECKPOINT 2: Guardar datos de FR360
      await saveCheckpoint(webhook, 'fr360_query', {
        paymentLink: paymentLinkData
      });

      // NOTIFICACIÓN PASO 2: Consulta FR360
      const paso2Duration = Date.now() - stepTimestamps.paso2;
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
      }, paso2Duration);
    }

    // PASO 2.1: Notificar al cliente vía Callbell
    let callbellResult = null;

    if (isStageCompleted(webhook, 'callbell_notification')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'callbell_notification');
      callbellResult = {
        success: true,
        messageId: stageData.messageId,
        phone: stageData.phone,
        sentAt: stageData.sentAt
      };
      logger.info(`[Processor] ⏭️ SKIP callbell_notification - Ya enviado: ${callbellResult.messageId}`);
      completedStages.callbell_notification = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'callbell_notification');

      // Ejecutar stage
      stepTimestamps.paso2_1 = Date.now();
      logger.info(`[Processor] PASO 2.1: Enviando notificación Callbell al cliente`);

      try {
        callbellResult = await callbellService.sendPaymentTemplate({
          phone: paymentLinkData.phone,
          product: paymentLinkData.product,
          amount: `$${parseFloat(webhook.amount).toLocaleString('es-CO')}`,
          email: paymentLinkData.email
        });

        if (callbellResult.success) {
          logger.info(`[Processor] ✅ Notificación Callbell enviada: ${callbellResult.messageId}`);
          completedStages.callbell_notification = true;
        } else {
          logger.warn(`[Processor] ⚠️ Notificación Callbell falló (no bloquea proceso): ${callbellResult.error}`);
        }

        // LOG PASO 2.1: Callbell
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'callbell_notification',
          status: callbellResult.success ? 'success' : 'warning',
          details: callbellResult.success
            ? `Notificación enviada a ${callbellResult.phone} - Message ID: ${callbellResult.messageId}`
            : `Notificación falló: ${callbellResult.error}`,
          request_payload: {
            phone: paymentLinkData.phone,
            givenName: paymentLinkData.givenName,
            amount: webhook.amount,
            email: paymentLinkData.email
          },
          response_data: callbellResult
        });

        // CHECKPOINT 2.1: Guardar resultado de Callbell
        if (callbellResult.success) {
          await saveCheckpoint(webhook, 'callbell_notification', {
            messageId: callbellResult.messageId,
            phone: callbellResult.phone,
            sentAt: callbellResult.sentAt
          });
        }

        // NOTIFICACIÓN PASO 2.1: Callbell
        const paso2_1Duration = Date.now() - stepTimestamps.paso2_1;
        await notificationService.notifyStep(2.1, 'NOTIFICACIÓN CALLBELL', {
          'Teléfono': callbellResult.phone,
          'Estado': callbellResult.success ? '✅ Enviado' : '⚠️ Falló',
          'Message ID': callbellResult.messageId || 'N/A',
          'Error': callbellResult.error || 'N/A'
        }, paso2_1Duration);

      } catch (error) {
        logger.error(`[Processor] Error en PASO 2.1 (Callbell):`, error);
        // No lanzar error, continuar con el proceso
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'callbell_notification',
          status: 'error',
          details: `Error al enviar notificación Callbell`,
          error_message: error.message
        });
      }
    }

    // STAGE 3: Verificar si el producto requiere creación de membresías
    const specialCase = isSpecialCase(paymentLinkData.product);
    const debeCrearMemberships = requiresMemberships(paymentLinkData.product);
    let membershipResult = null;

    // CASO ESPECIAL: Productos que requieren notificación manual
    if (specialCase) {
      // Verificar si ya se procesó este caso especial
      if (isStageCompleted(webhook, 'membership_check')) {
        // Cargar desde checkpoint
        const stageData = getStageData(webhook, 'membership_check');
        logger.info(`[Processor] ⏭️ SKIP membership_check - Caso especial ya procesado: ${stageData.type}`);
      } else {
        // Ejecutar stage
        logger.info(`[Processor] Caso especial detectado: ${specialCase.type} - ${specialCase.producto}`);
        stepTimestamps.paso3 = Date.now();

      // Enviar notificación a Google Chat
      await notifySpecialCase({
        type: specialCase.type,
        producto: paymentLinkData.product,
        customerName: `${paymentLinkData.givenName} ${paymentLinkData.familyName}`,
        email: paymentLinkData.email,
        phone: paymentLinkData.phone,
        identityDocument: paymentLinkData.identityDocument,
        amount: `$${parseFloat(webhook.amount).toLocaleString('es-CO')}`,
        refPayco: webhook.ref_payco
      });

      // Registrar como exitoso (no requiere membresías automáticas)
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_check',
        status: 'success',
        details: `Caso especial: ${specialCase.type === 'cuota_extraordinaria' ? 'Cuota extraordinaria' : 'Élite 3 meses'} - Notificación enviada a Google Chat para gestión manual`
      });

      // NOTIFICACIÓN PASO 3: Caso especial
      const paso3Duration = Date.now() - stepTimestamps.paso3;
      await notificationService.notifyStep(3, 'CASO ESPECIAL DETECTADO', {
        'Producto': paymentLinkData.product,
        'Tipo': specialCase.type === 'cuota_extraordinaria' ? '⚠️ Cuota extraordinaria' : 'ℹ️ Élite 3 meses',
        'Requiere membresías automáticas': '❌ No',
        'Acción': '✅ Notificación enviada a Google Chat',
        'Resultado': '✅ Gestión manual requerida'
      }, paso3Duration);

        // CHECKPOINT: Guardar que se procesó el caso especial
        await saveCheckpoint(webhook, 'membership_check', {
          specialCase: true,
          type: specialCase.type,
          producto: paymentLinkData.product,
          notificationSent: true
        });
      } // Fin del else de membership_check

    } else if (debeCrearMemberships) {
      if (isStageCompleted(webhook, 'membership_creation')) {
        // Cargar desde checkpoint
        const stageData = getStageData(webhook, 'membership_creation');
        membershipResult = {
          membershipsCreadas: stageData.memberships || [],
          activationUrl: stageData.activationUrl,
          etiquetas: stageData.etiquetas || []
        };
        logger.info(`[Processor] ⏭️ SKIP membership_creation - Ya creadas: ${membershipResult.membershipsCreadas.length} membresía(s)`);
        completedStages.memberships = true;
      } else {
        // Marcar inicio del stage en BD
        await markStageStart(webhook, 'membership_creation');

        // Ejecutar stage
        stepTimestamps.paso3 = Date.now();

      // Registrar creación de membresías
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'processing',
        details: `Creando membresías para producto: ${paymentLinkData.product}`
      });

      // Crear membresías en FR360 (sin contactId aún)
      // La notificación se envía DENTRO de membershipService.createMemberships()
      // Pasar timestamp para calcular duración
      membershipResult = await membershipService.createMemberships({
        contactId: null, // Aún no tenemos contactId de CRM
        identityDocument: paymentLinkData.identityDocument,
        email: paymentLinkData.email,
        givenName: paymentLinkData.givenName,
        familyName: paymentLinkData.familyName,
        phone: paymentLinkData.phone,
        product: paymentLinkData.product,
        accessDate: paymentLinkData.accessDate,
        webhookId: webhookId,
        startTimestamp: stepTimestamps.paso3 // Pasar timestamp de inicio
      });

      // membershipResult contiene: { activationUrl, etiquetas, membreshipsCreadas }
      logger.info(`[Processor] Membresías procesadas. Activation URL: ${membershipResult.activationUrl || 'N/A'}`);
      logger.info(`[Processor] Etiquetas a aplicar: ${membershipResult.etiquetas.join(', ')}`);
      completedStages.memberships = true;

      // LOG PASO 3: Membresías creadas exitosamente
      let membershipsDetail = 'N/A';
      let membershipsCount = 0;

      if (membershipResult.membershipsCreadas && Array.isArray(membershipResult.membershipsCreadas)) {
        membershipsCount = membershipResult.membershipsCreadas.length;
        membershipsDetail = membershipResult.membershipsCreadas
          .map((m, idx) => `${idx + 1}. ${m.nombre} (Plan ID: ${m.planId}) - ${m.usaDuracion ? `${m.duracion} días` : `Hasta ${m.fin}`}`)
          .join('; ');
      }

      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'success',
        details: `${membershipsCount} membresía(s) creada(s) - ${membershipsDetail}${membershipResult.activationUrl ? ` | activationUrl: ${membershipResult.activationUrl}` : ''}`
      });

      // CHECKPOINT 3: Guardar resultado de membresías
      await saveCheckpoint(webhook, 'membership_creation', {
        memberships: membershipResult.membreshipsCreadas || [],
        activationUrl: membershipResult.activationUrl,
        etiquetas: membershipResult.etiquetas
      });
      }
    } else {
      logger.info(`[Processor] Producto no requiere membresías: ${paymentLinkData.product}`);

      // LOG PASO 3: Sin membresías
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_check',
        status: 'info',
        details: `Producto no requiere membresías: ${paymentLinkData.product} (Cuota 2+ o producto no permitido)`
      });

      // NOTIFICACIÓN PASO 3: Sin membresías
      const paso3Duration = Date.now() - stepTimestamps.paso3;
      await notificationService.notifyStep(3, 'VERIFICACIÓN DE MEMBRESÍAS', {
        'Producto': paymentLinkData.product,
        'Requiere membresías': '❌ No',
        'Motivo': 'Cuota 2+ o producto no permitido',
        'Resultado': 'ℹ️ Se omite creación de membresías'
      }, paso3Duration);
    }

    // STAGE 4: Registrar búsqueda/creación de contacto en CRM
    let contact, crmAction;

    if (isStageCompleted(webhook, 'crm_management')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'crm_management');
      contact = stageData.contact;
      crmAction = stageData.action;
      logger.info(`[Processor] ⏭️  SKIP crm_management - Contacto CRM ID ${contact.id} ya gestionado (cargado desde checkpoint)`);
      completedStages.crm = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'crm_management');

      // Ejecutar stage
      stepTimestamps.paso4 = Date.now();
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'crm_upsert',
        status: 'processing',
        details: `Buscando o creando contacto en CRM: ${paymentLinkData.email}`
      });

      // Buscar o crear contacto en ActiveCampaign
      const crmResult = await crmService.createOrUpdateContact(paymentLinkData, webhook);
      contact = crmResult.contact;
      crmAction = crmResult.action;

    logger.info(`[Processor] Contacto ${crmAction} con CRM ID: ${contact.id}`);

    // Guardar en BD local para auditoría y debugging
    const emailLowercase = paymentLinkData.email.toLowerCase();
    const [localContact, created] = await Contact.findOrCreate({
      where: { email: emailLowercase },
      defaults: {
        crm_id: contact.id,
        email: emailLowercase,
        name: `${paymentLinkData.givenName || ''} ${paymentLinkData.familyName || ''}`.trim(),
        phone: paymentLinkData.phone,
        identity_document: paymentLinkData.identityDocument
      }
    });
    if (created) {
      logger.info(`[Processor] Contacto guardado en BD local: ${localContact.id}`);
    } else {
      logger.info(`[Processor] Contacto ya existía en BD local: ${localContact.id}`);
    }

    // Actualizar memberships con el contact_id local (si se crearon memberships)
    if (membershipResult && webhookId) {
      const { Membership } = require('../models');
      const updateCount = await Membership.update(
        { contact_id: localContact.id },
        { where: { webhook_id: webhookId, contact_id: null } }
      );
      if (updateCount[0] > 0) {
        logger.info(`[Processor] ${updateCount[0]} membership(s) vinculada(s) al contacto local ID ${localContact.id}`);
      }
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
    const membershipsEnabled = await FeatureFlag.isEnabled('MEMBERSHIPS_ENABLED', config.frapp.modoProduccion);
    const etiquetasAplicadas = [];
    let etiquetasDetalle = 'N/A';
    let etiquetasLabel = 'Etiquetas aplicadas';

    if (membershipResult?.etiquetas && membershipResult.etiquetas.length > 0) {
      if (membershipsEnabled) {
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

    // LOG PASO 4: CRM gestionado
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'crm_management',
      status: 'success',
      details: `Contacto ${crmAction === 'created' ? 'creado' : 'actualizado'} en CRM - ID: ${contact.id}, Email: ${paymentLinkData.email}, Nombre: ${paymentLinkData.givenName} ${paymentLinkData.familyName}${membershipResult?.activationUrl ? `, activationUrl actualizada` : ''}${etiquetasAplicadas.length > 0 ? `, Etiquetas aplicadas: ${etiquetasAplicadas.join(', ')}` : ''}`,
      request_payload: {
        email: paymentLinkData.email,
        firstName: paymentLinkData.givenName,
        lastName: paymentLinkData.familyName,
        phone: paymentLinkData.phone,
        activationUrl: membershipResult?.activationUrl,
        tags: membershipResult?.etiquetas || []
      },
      response_data: {
        contactId: contact.id,
        action: crmAction,
        tagsApplied: etiquetasAplicadas
      }
    });

      // CHECKPOINT 4: Guardar contacto del CRM
      await saveCheckpoint(webhook, 'crm_management', {
        contact: {
          id: contact.id,
          email: paymentLinkData.email,
          firstName: paymentLinkData.givenName,
          lastName: paymentLinkData.familyName,
          phone: paymentLinkData.phone
        },
        action: crmAction,
        tagsApplied: etiquetasAplicadas
      });

      // NOTIFICACIÓN PASO 4 COMPLETADA: CRM (solo una vez, al final)
      const paso4Duration = Date.now() - stepTimestamps.paso4;
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
      }, paso4Duration);
    } // Fin del else de crm_management

    // STAGE 5: Buscar o crear cliente en World Office
    // Esto incluirá la búsqueda de ciudad en el caché
    let woCustomerResult;

    if (isStageCompleted(webhook, 'worldoffice_customer')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'worldoffice_customer');
      woCustomerResult = {
        customerId: stageData.customerId,
        action: stageData.action,
        comercialWOId: stageData.comercialWOId,
        customerData: stageData.customerData
      };
      logger.info(`[Processor] ⏭️  SKIP worldoffice_customer - Cliente WO ID ${woCustomerResult.customerId} ya gestionado (cargado desde checkpoint)`);
      completedStages.worldoffice_customer = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'worldoffice_customer');

      // Ejecutar stage
      stepTimestamps.paso5 = Date.now();
      logger.info(`[Processor] PASO 5: Gestionando cliente en World Office`);

      woCustomerResult = await worldOfficeService.findOrUpdateCustomer({
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

    // LOG PASO 5: Cliente World Office gestionado
    const customerActionText = woCustomerResult.action === 'created' ? 'creado' :
                                woCustomerResult.action === 'updated' ? 'actualizado' : 'encontrado';

    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'worldoffice_customer',
      status: 'success',
      details: `Cliente ${customerActionText} en World Office - ID: ${woCustomerResult.customerId}, Cédula: ${paymentLinkData.identityDocument}, Ciudad: ${woCustomerResult.customerData?.cityName || 'N/A'} (ID: ${woCustomerResult.customerData?.cityId || 'N/A'}), Comercial WO ID: ${woCustomerResult.comercialWOId}`,
      request_payload: {
        identityDocument: paymentLinkData.identityDocument,
        givenName: paymentLinkData.givenName,
        familyName: paymentLinkData.familyName,
        email: paymentLinkData.email,
        phone: paymentLinkData.phone,
        city: webhook.customer_city,
        address: webhook.customer_address,
        comercial: paymentLinkData.comercial
      },
      response_data: {
        action: woCustomerResult.action,
        customerId: woCustomerResult.customerId,
        comercialWOId: woCustomerResult.comercialWOId,
        customerData: woCustomerResult.customerData
      }
    });

    // NOTIFICACIÓN PASO 5: World Office
    const paso5Duration = Date.now() - stepTimestamps.paso5;
    const cityText = webhook.customer_city || 'N/A';
    const cityUsed = woCustomerResult.customerData?.cityName || 'N/A';

    // Determinar el texto de la acción
    let actionText = '❓ Acción desconocida';
    if (woCustomerResult.action === 'created') {
      actionText = '🆕 Cliente creado en WO';
    } else if (woCustomerResult.action === 'updated') {
      actionText = '🔄 Cliente actualizado en WO';
    } else if (woCustomerResult.action === 'found') {
      actionText = '✅ Cliente encontrado en WO (sin actualizar)';
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
      }, paso5Duration);

      // CHECKPOINT 5: Guardar cliente de WorldOffice
      await saveCheckpoint(webhook, 'worldoffice_customer', {
        customerId: woCustomerResult.customerId,
        action: woCustomerResult.action,
        comercialWOId: woCustomerResult.comercialWOId,
        customerData: woCustomerResult.customerData
      });
    } // Fin del else de worldoffice_customer

    // STAGE 6: FACTURACIÓN EN WORLD OFFICE (Crear + Contabilizar + Emitir DIAN)
    logger.info(`[Processor] PASO 6: Facturando en World Office`);

    let invoiceResult = null;
    let accountingResult = null;
    let dianResult = null;

    // PASO 6A: Crear factura
    if (isStageCompleted(webhook, 'worldoffice_invoice_creation')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'worldoffice_invoice_creation');
      invoiceResult = {
        documentoId: stageData.documentoId,
        numeroFactura: stageData.numeroFactura,
        renglones: stageData.renglones,
        simulado: stageData.simulado || false
      };
      logger.info(`[Processor] ⏭️  SKIP worldoffice_invoice_creation - Factura ${invoiceResult.numeroFactura} ya creada (cargada desde checkpoint)`);
      completedStages.worldoffice_invoice = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'worldoffice_invoice_creation');

      stepTimestamps.paso6a = Date.now();

      try {
        invoiceResult = await worldOfficeService.createInvoice({
          customerId: woCustomerResult.customerId,
          comercialWOId: woCustomerResult.comercialWOId,
          product: paymentLinkData.product,
          amount: parseFloat(webhook.amount)
        });

        completedStages.worldoffice_invoice = true;
        logger.info(`[Processor] Factura creada - Documento ID: ${invoiceResult.documentoId}`);

      // LOG PASO 6A: Factura creada
      const renglonesResumen = invoiceResult.renglones?.map(r => {
        const inventarioInfo = r.idInventario === 1010 ? 'FR Libros' :
                               r.idInventario === 1001 ? 'MIR' :
                               r.idInventario === 1054 ? 'Simulación' :
                               r.idInventario === 1004 ? 'Iaura' :
                               r.idInventario === 1008 ? 'Sculapp' :
                               r.idInventario === 1003 ? 'Asesoría' :
                               r.idInventario === 1062 ? 'Publicidad' :
                               r.idInventario === 1057 ? 'Acceso VIP' :
                               r.idInventario === 1059 ? 'Inglés' :
                               r.idInventario === 1067 ? 'VIP - Rmastery' :
                               `ID ${r.idInventario}`;
        return `${inventarioInfo} (${r.cantidad || 1} und, $${(r.valorUnitario || r.valorTotal || 0).toLocaleString('es-CO')})`;
      }).join(', ') || 'N/A';

      const subtotal = invoiceResult.renglones?.reduce((sum, r) => sum + (r.valorUnitario || r.valorTotal || 0), 0) || 0;
      const ivaTotal = invoiceResult.renglones?.reduce((sum, r) => sum + (r.iva || 0), 0) || 0;

      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'worldoffice_invoice_creation',
        status: 'success',
        details: `Factura creada ${invoiceResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} - Nro: ${invoiceResult.numeroFactura}, Doc ID: ${invoiceResult.documentoId}, Productos: [${renglonesResumen}], Subtotal: $${subtotal.toLocaleString('es-CO')}, IVA: $${ivaTotal.toLocaleString('es-CO')}, Total: $${parseFloat(webhook.amount).toLocaleString('es-CO')}`,
        request_payload: invoiceResult.payload || null,
        response_data: {
          numeroFactura: invoiceResult.numeroFactura,
          documentoId: invoiceResult.documentoId,
          renglones: invoiceResult.renglones,
          subtotal,
          ivaTotal,
          total: parseFloat(webhook.amount),
          simulado: invoiceResult.simulado
        }
      });

      // Loguear el payload completo de la factura para debugging
      if (invoiceResult.payload) {
        logger.info(`[Processor] 📋 Payload completo enviado a World Office:`);
        logger.info(JSON.stringify(invoiceResult.payload, null, 2));
      }

      // Preparar información de los renglones para la notificación
      let renglonesDetalle = '';
      if (invoiceResult.renglones && invoiceResult.renglones.length > 0) {
        renglonesDetalle = invoiceResult.renglones.map((renglon, idx) => {
          const numero = idx + 1;
          const inventarioInfo = renglon.idInventario === 1010 ? 'FR Libros' :
                                 renglon.idInventario === 1001 ? 'MIR' :
                                 renglon.idInventario === 1054 ? 'Simulación' :
                                 renglon.idInventario === 1004 ? 'Iaura' :
                                 renglon.idInventario === 1008 ? 'Sculapp' :
                                 renglon.idInventario === 1003 ? 'Asesoría' :
                                 renglon.idInventario === 1062 ? 'Publicidad' :
                                 renglon.idInventario === 1057 ? 'Acceso VIP' :
                                 renglon.idInventario === 1059 ? 'Inglés' :
                                 renglon.idInventario === 1067 ? 'VIP - Rmastery' :
                                 `ID ${renglon.idInventario}`;

          const valorUnitario = renglon.valorUnitario || renglon.valorTotal || 0;
          const iva = renglon.iva || 0; // Ya viene calculado correctamente desde worldOfficeService
          const totalConIva = valorUnitario + iva;

          let detalle = `${numero}️⃣ Producto: ${inventarioInfo} (ID: ${renglon.idInventario})\n`;
          detalle += `   • Cantidad: ${renglon.cantidad || 1} und\n`;
          detalle += `   • Valor unitario: $${valorUnitario.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (sin IVA)\n`;
          detalle += `   • Valor total: $${valorUnitario.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;

          if (iva > 0) {
            detalle += `   • IVA (19%): $${iva.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
            detalle += `   • Total con IVA: $${totalConIva.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
          } else {
            detalle += `   • IVA: $0.00 (exento)\n`;
            detalle += `   • Total: $${valorUnitario.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
          }

          detalle += `   • Centro de costo: ${renglon.idCentroCosto || 1}\n`;
          detalle += `   • Bodega: ${renglon.idBodega || 1}`;

          if (renglon.concepto) {
            detalle += `\n   • ${renglon.concepto}`;
          }

          return detalle;
        }).join('\n\n');
      }

      // Calcular totales (ya calculados arriba para el log, reutilizarlos)
      const totalFactura = parseFloat(webhook.amount);

      const paso6aDuration = Date.now() - stepTimestamps.paso6a;

      // Determinar el modo para la notificación
      const modoFactura = invoiceResult.simulado ? '🟡 MODO TESTING - Factura simulada' : '🟢 MODO PRODUCCIÓN - Factura real creada';

      await notificationService.notifyStep(6, 'CREACIÓN DE FACTURA (WORLD OFFICE)', {
        '📋 DATOS GENERALES': '',
        'Fecha': new Date().toISOString().split('T')[0],
        'Prefijo': '16',
        'Tipo': 'FV (Factura de Venta)',
        'Cliente ID WO': woCustomerResult.customerId,
        'Comercial ID WO': woCustomerResult.comercialWOId,
        'Forma de pago': '1001',
        'Concepto': paymentLinkData.product,
        '': '',
        '💰 PRODUCTOS FACTURADOS': renglonesDetalle ? `\n${renglonesDetalle}` : 'No disponible',
        ' ': '',
        '📊 RESUMEN FINANCIERO': '',
        'Subtotal (sin IVA)': `$${subtotal.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        'IVA total': `$${ivaTotal.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        'Total factura': `$${totalFactura.toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        '  ': '',
        'Modo': modoFactura,
        'Documento ID': invoiceResult.documentoId,
        'Número factura': invoiceResult.numeroFactura,
        'Resultado': '✅ Factura creada exitosamente'
      }, paso6aDuration);

      // CHECKPOINT: Guardar factura creada
      await saveCheckpoint(webhook, 'worldoffice_invoice_creation', {
        documentoId: invoiceResult.documentoId,
        numeroFactura: invoiceResult.numeroFactura,
        renglones: invoiceResult.renglones,
        simulado: invoiceResult.simulado || false,
        amount: parseFloat(webhook.amount)
      });

    } catch (error) {
      logger.error(`[Processor] Error creando factura: ${error.message}`);

      // LOG ERROR PASO 6A: Error creando factura
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'worldoffice_invoice_creation',
        status: 'error',
        details: `Error creando factura en World Office - Cliente ID: ${woCustomerResult.customerId}, Producto: ${paymentLinkData.product}`,
        error_message: error.message
      });

      throw error;
    }
    } // Fin del else de worldoffice_invoice_creation

    // PASO 6B: Contabilizar factura
    if (isStageCompleted(webhook, 'worldoffice_invoice_accounting')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'worldoffice_invoice_accounting');
      accountingResult = {
        status: stageData.status,
        accountingDate: stageData.accountingDate,
        simulado: stageData.simulado || false
      };
      logger.info(`[Processor] ⏭️  SKIP worldoffice_invoice_accounting - Factura ${invoiceResult.numeroFactura} ya contabilizada (cargada desde checkpoint)`);
      completedStages.worldoffice_accounting = true;
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'worldoffice_invoice_accounting');

      // Ejecutar stage
      stepTimestamps.paso6b = Date.now();

      try {
        accountingResult = await worldOfficeService.accountInvoice(invoiceResult.documentoId);
        completedStages.worldoffice_accounting = true;
        logger.info(`[Processor] Factura contabilizada - Status: ${accountingResult.status}`);

        // LOG PASO 6B: Factura contabilizada
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_invoice_accounting',
          status: 'success',
          details: `Factura contabilizada ${accountingResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, Status: ${accountingResult.status}, Fecha: ${accountingResult.accountingDate}`,
          request_payload: { documentoId: invoiceResult.documentoId },
          response_data: {
            status: accountingResult.status,
            accountingDate: accountingResult.accountingDate,
            simulado: accountingResult.simulado
          }
        });

        const paso6bDuration = Date.now() - stepTimestamps.paso6b;
        const modoContabilizacion = accountingResult.simulado ? '🟡 MODO TESTING - Contabilización simulada' : '🟢 MODO PRODUCCIÓN - Contabilización real';

        await notificationService.notifyStep(7, 'CONTABILIZACIÓN DE FACTURA (WORLD OFFICE)', {
          'Documento ID': invoiceResult.documentoId,
          'Número factura': invoiceResult.numeroFactura,
          'Status': accountingResult.status,
          'Fecha contabilización': accountingResult.accountingDate,
          'Modo': modoContabilizacion,
          'Resultado': '✅ Factura contabilizada exitosamente'
        }, paso6bDuration);

        // CHECKPOINT 6B: Guardar resultado de contabilización
        await saveCheckpoint(webhook, 'worldoffice_invoice_accounting', {
          documentoId: invoiceResult.documentoId,
          numeroFactura: invoiceResult.numeroFactura,
          status: accountingResult.status,
          accountingDate: accountingResult.accountingDate,
          simulado: accountingResult.simulado || false
        });

      } catch (error) {
        logger.error(`[Processor] Error contabilizando factura: ${error.message}`);

        // LOG ERROR PASO 6B: Error contabilizando factura
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_invoice_accounting',
          status: 'error',
          details: `Error contabilizando factura - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}`,
          error_message: error.message
        });

        throw error;
      }
    } // Fin del else de worldoffice_invoice_accounting

    // PASO 6C: Emitir ante DIAN
    if (isStageCompleted(webhook, 'worldoffice_dian_emission')) {
      // Cargar desde checkpoint
      const stageData = getStageData(webhook, 'worldoffice_dian_emission');
      dianResult = {
        skipped: stageData.skipped || false,
        warning: stageData.warning || false,
        cufe: stageData.cufe,
        dianStatus: stageData.dianStatus,
        emittedAt: stageData.emittedAt,
        simulado: stageData.simulado || false
      };

      const skipReason = dianResult.skipped ? 'desactivada' : dianResult.warning ? 'ya emitida (409)' : 'ya emitida';
      logger.info(`[Processor] ⏭️  SKIP worldoffice_dian_emission - Emisión DIAN ${skipReason} (cargada desde checkpoint)`);

      if (!dianResult.skipped && !dianResult.warning) {
        completedStages.worldoffice_dian = true;
      }
    } else {
      // Marcar inicio del stage en BD
      await markStageStart(webhook, 'worldoffice_dian_emission');

      // Ejecutar stage
      stepTimestamps.paso6c = Date.now();

      try {
        dianResult = await worldOfficeService.emitDianInvoice(invoiceResult.documentoId);

      if (dianResult.skipped) {
        logger.info(`[Processor] Emisión DIAN omitida (desactivada en configuración)`);

        // LOG PASO 6C: DIAN desactivada
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'info',
          details: `Emisión DIAN desactivada por configuración (WORLDOFFICE_DIAN_ENABLED=false) - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}`,
          request_payload: { documentoId: invoiceResult.documentoId },
          response_data: { skipped: true, reason: 'WORLDOFFICE_DIAN_ENABLED=false' }
        });

      } else if (dianResult.warning) {
        logger.warn(`[Processor] Factura ya emitida previamente (409)`);
        completedStages.worldoffice_dian = true;

        // LOG PASO 6C: DIAN ya emitida
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'info',
          details: `Factura ya emitida previamente (409) - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, CUFE: ${dianResult.cufe || 'N/A'}`,
          request_payload: { documentoId: invoiceResult.documentoId },
          response_data: { warning: true, cufe: dianResult.cufe, statusCode: 409 }
        });

      } else {
        logger.info(`[Processor] Factura emitida ante DIAN - CUFE: ${dianResult.cufe}`);
        completedStages.worldoffice_dian = true;

        // LOG PASO 6C: DIAN emitida exitosamente
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'success',
          details: `Factura emitida ${dianResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} ante DIAN - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, CUFE: ${dianResult.cufe}, Status DIAN: ${dianResult.dianStatus}, Fecha: ${dianResult.emittedAt}`,
          request_payload: { documentoId: invoiceResult.documentoId },
          response_data: {
            cufe: dianResult.cufe,
            dianStatus: dianResult.dianStatus,
            emittedAt: dianResult.emittedAt,
            simulado: dianResult.simulado
          }
        });
      }

      const paso6cDuration = Date.now() - stepTimestamps.paso6c;

      let statusDian = '';
      let modoDian = '';

      if (dianResult.skipped) {
        statusDian = '⚠️ Emisión DIAN desactivada';
        modoDian = '🔴 WORLDOFFICE_EMITIR_DIAN=false';
      } else if (dianResult.warning) {
        statusDian = '⚠️ Factura ya emitida previamente';
        modoDian = '🟠 Error 409 - Continuando proceso';
      } else if (dianResult.simulado) {
        statusDian = '✅ Emisión simulada exitosamente';
        modoDian = '🟡 MODO TESTING - Emisión DIAN simulada';
      } else {
        statusDian = '✅ Emitida exitosamente ante DIAN';
        modoDian = '🟢 MODO PRODUCCIÓN - Emisión DIAN real';
      }

      await notificationService.notifyStep(8, 'EMISIÓN FACTURA ELECTRÓNICA (DIAN)', {
        'Documento ID': invoiceResult.documentoId,
        'Número factura': invoiceResult.numeroFactura,
        'CUFE': dianResult.cufe || 'N/A',
        'Status DIAN': dianResult.dianStatus,
        'Fecha emisión': dianResult.emittedAt || 'N/A',
        'Modo': modoDian,
        'Resultado': statusDian
      }, paso6cDuration);

        // CHECKPOINT 6C: Guardar resultado de emisión DIAN
        await saveCheckpoint(webhook, 'worldoffice_dian_emission', {
          documentoId: invoiceResult.documentoId,
          numeroFactura: invoiceResult.numeroFactura,
          skipped: dianResult.skipped || false,
          warning: dianResult.warning || false,
          cufe: dianResult.cufe,
          dianStatus: dianResult.dianStatus,
          emittedAt: dianResult.emittedAt,
          simulado: dianResult.simulado || false
        });

      } catch (error) {
        logger.error(`[Processor] Error emitiendo factura ante DIAN: ${error.message}`);

        // LOG ERROR PASO 6C: Error en emisión DIAN
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'error',
          details: `Error emitiendo factura ante DIAN - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}`,
          request_payload: { documentoId: invoiceResult.documentoId },
          error_message: error.message
        });

        // No lanzar error, continuar proceso (emisión DIAN no es crítica)
        logger.warn(`[Processor] Continuando proceso sin emisión DIAN`);
      }
    } // Fin del else de worldoffice_dian_emission

    // ===================================================================
    // PASO 7: REGISTRO EN STRAPI + ACTUALIZACIÓN DE CARTERAS
    // ===================================================================
    stepTimestamps.paso7 = Date.now();
    logger.info(`[Processor] PASO 7: Registrando en Strapi y actualizando carteras`);

    let strapiFacturacionId = null;
    let pazYSalvo = null;
    let cuotasActualizadas = 0;

    try {
      // Validar configuración de Strapi
      if (!config.strapi?.apiUrl || !config.strapi?.apiToken) {
        throw new Error('Configuración de Strapi incompleta. Faltan variables: STRAPI_API_URL y/o STRAPI_API_TOKEN');
      }

      // 7A: Buscar comercial en caché de Strapi
      const comercial = await strapiCache.findComercialByName(paymentLinkData.salesRep);
      const comercialId = comercial ? comercial.id : null;

      if (!comercialId) {
        logger.warn(`[Processor] Comercial no encontrado en Strapi: ${paymentLinkData.salesRep}`);
      } else {
        logger.info(`[Processor] Comercial encontrado: ${paymentLinkData.salesRep} → ID ${comercialId}`);
      }

      // 7B: Buscar producto en caché de Strapi (primero completo, luego base)
      const producto = await strapiCache.findProductoByName(paymentLinkData.product);
      const productoId = producto ? producto.id : null;

      if (!productoId) {
        logger.warn(`[Processor] Producto no encontrado en Strapi: ${paymentLinkData.product}`);
      } else {
        logger.info(`[Processor] Producto encontrado: ${paymentLinkData.product} → ID ${productoId}`);
      }

      // 7C: Calcular paz_y_salvo
      const acuerdo = paymentLinkData.agreementId || 'Contado';

      if (acuerdo === 'Contado') {
        // Pagos de contado siempre están a paz y salvo
        pazYSalvo = 'Si';
        logger.info(`[Processor] Acuerdo "Contado" → paz_y_salvo = "Si"`);

      } else {
        // Acuerdo financiado: actualizar carteras y determinar paz y salvo
        logger.info(`[Processor] Acuerdo financiado: ${acuerdo}`);

        // Obtener valorUnitario del PASO 6 (invoice creation)
        const valorUnitario = invoiceResult?.renglones?.[0]?.valorUnitario || invoiceResult?.subtotal || webhook.amount;

        // Preparar el pago actual para simular
        const pagoNuevo = {
          transaccion: invoiceId, // ID de la factura/transacción
          producto: paymentLinkData.product, // Producto completo con "- Cuota N"
          valor_neto: parseFloat(valorUnitario),
          fecha: toColombiaISO(), // Fecha en hora de Colombia (UTC-5)
          acuerdo: acuerdo
        };

        logger.info(`[Processor] Simulando pago: ${pagoNuevo.producto} → $${pagoNuevo.valor_neto}`);

        // Actualizar carteras y determinar si queda a paz y salvo
        const resultadoCarteras = await strapiCarteraService.actualizarCarterasPorAcuerdo(acuerdo, pagoNuevo);

        cuotasActualizadas = resultadoCarteras.cuotas_actualizadas;
        pazYSalvo = resultadoCarteras.todas_pagadas ? 'Si' : 'No';

        logger.info(`[Processor] Carteras actualizadas: ${cuotasActualizadas} cuotas`);
        logger.info(`[Processor] Todas pagadas: ${resultadoCarteras.todas_pagadas} → paz_y_salvo = "${pazYSalvo}"`);

        // LOG: Actualización de carteras
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'strapi_cartera_update',
          status: 'success',
          details: `${cuotasActualizadas} cuotas actualizadas para acuerdo ${acuerdo}. Paz y salvo: ${pazYSalvo}`,
          request_payload: { acuerdo, pago_nuevo: pagoNuevo },
          response_data: {
            cuotas_actualizadas: cuotasActualizadas,
            todas_pagadas: resultadoCarteras.todas_pagadas,
            paz_y_salvo: pazYSalvo,
            detalles: resultadoCarteras.detalles
          }
        });
      }

      // 7D: Preparar payload para /api/facturaciones
      const valorUnitario = invoiceResult?.renglones?.[0]?.valorUnitario || invoiceResult?.subtotal || webhook.amount;
      const valorBruto = parseFloat(webhook.amount);
      const valorSinIva = parseFloat(valorUnitario);
      const vlrAntesDeIva = (valorBruto - valorSinIva) / 1.19;
      const valorNeto = valorSinIva + vlrAntesDeIva;

      // Calcular comentarios (si el pagador es diferente al titular)
      const webhookDocument = webhook.raw_data?.x_customer_document;
      const cedulaTitular = paymentLinkData.identityDocument;
      let comentarios = null;

      if (webhookDocument && webhookDocument !== cedulaTitular) {
        const pagadorNombre = webhook.raw_data?.x_customer_name || '';
        const pagadorApellido = webhook.raw_data?.x_customer_lastname || '';
        comentarios = `Pagador: ${pagadorNombre} ${pagadorApellido} CC: ${webhookDocument}`;
        logger.info(`[Processor] Pagador diferente detectado: ${comentarios}`);
      }

      // Fecha inicio (accessDate de FR360, o hoy en Colombia)
      const fechaInicioRaw = paymentLinkData.accessDate;
      const fechaInicio = fechaInicioRaw ? new Date(fechaInicioRaw).toISOString() : toColombiaISO();

      // Fecha actual (Colombia UTC-5)
      const fechaHoy = toColombiaISO();

      const facturacionPayload = {
        tipo_documento: 1,
        numero_documento: paymentLinkData.identityDocument,
        transaccion: invoiceId,
        nombres: paymentLinkData.givenName,
        apellidos: paymentLinkData.familyName,
        ciudad: woCustomerResult.customerData?.cityName || webhook.customer_city || 'N/A',
        direccion: webhook.customer_address || 'N/A',
        telefono: paymentLinkData.phone,
        correo: paymentLinkData.email,
        comercial: comercialId,
        producto: productoId,
        valor_bruto: valorBruto,
        valor_sin_iva: valorSinIva,
        vlr_antes_de_iva: vlrAntesDeIva,
        valor_neto: valorNeto,
        acuerdo: acuerdo,
        fecha_inicio: fechaInicio,
        activacion: null, // Siempre null según especificación
        paz_y_salvo: pazYSalvo,
        comentarios: comentarios,
        id_tercero_WO: woCustomerResult.customerId || null,
        doc_venta_wo: invoiceResult?.documentoId || null,
        fecha: fechaHoy
      };

      logger.info(`[Processor] Payload para Strapi facturaciones preparado`);

      // 7E: POST a /api/facturaciones (con checkpoint)
      if (isStageCompleted(webhook, 'strapi_facturacion_creation')) {
        // Cargar desde checkpoint
        const stageData = getStageData(webhook, 'strapi_facturacion_creation');
        strapiFacturacionId = stageData.strapiFacturacionId;
        logger.info(`[Processor] ⏭️  SKIP strapi_facturacion_creation - Facturación ${strapiFacturacionId} ya registrada (cargada desde checkpoint)`);
        completedStages.strapi_facturacion = true;
      } else {
        // Marcar inicio del stage en BD
        await markStageStart(webhook, 'strapi_facturacion_creation');

        // Ejecutar stage
        const strapiUrl = `${config.strapi.apiUrl}/api/facturaciones`;

        const strapiResponse = await axios.post(strapiUrl, { data: facturacionPayload }, {
          headers: {
            'Authorization': `Bearer ${config.strapi.apiToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        strapiFacturacionId = strapiResponse.data.data?.id || strapiResponse.data.data?.documentId;

        logger.info(`[Processor] Facturación registrada en Strapi - ID: ${strapiFacturacionId}`);
        completedStages.strapi_facturacion = true;

        // LOG: Facturación creada en Strapi
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'strapi_facturacion_creation',
          status: 'success',
          details: `Facturación registrada en Strapi - ID: ${strapiFacturacionId}, Acuerdo: ${acuerdo}, Paz y salvo: ${pazYSalvo}, Comercial: ${paymentLinkData.salesRep} (ID: ${comercialId}), Producto: ${paymentLinkData.product} (ID: ${productoId})`,
          request_payload: facturacionPayload,
          response_data: strapiResponse.data
        });

        // CHECKPOINT: Guardar facturación de Strapi
        await saveCheckpoint(webhook, 'strapi_facturacion_creation', {
          strapiFacturacionId: strapiFacturacionId,
          acuerdo: acuerdo,
          pazYSalvo: pazYSalvo,
          comercialId: comercialId,
          productoId: productoId
        });
      } // Fin del else de strapi_facturacion_creation

      // NOTIFICACIÓN PASO 7: Strapi (fuera del else, se ejecuta siempre)
      const paso7Duration = Date.now() - stepTimestamps.paso7;

      await notificationService.notifyStep(9, 'REGISTRO STRAPI + CARTERAS', {
        'Facturación ID': strapiFacturacionId || 'N/A',
        'Acuerdo': acuerdo,
        'Paz y salvo': pazYSalvo === 'Si' ? '✅ SÍ' : '❌ NO',
        'Cuotas actualizadas': cuotasActualizadas > 0 ? `${cuotasActualizadas} cuotas` : 'N/A (Contado)',
        'Comercial': `${paymentLinkData.salesRep} (ID: ${comercialId || 'N/A'})`,
        'Producto': `${paymentLinkData.product} (ID: ${productoId || 'N/A'})`,
        'Valor neto': `$${valorNeto.toLocaleString('es-CO')}`,
        'ID Tercero WO': woCustomerResult.customerId || 'N/A',
        'Doc Venta WO': invoiceResult?.documentoId || 'N/A'
      }, paso7Duration);

    } catch (error) {
      logger.error(`[Processor] Error en PASO 7 (Strapi): ${error.message}`);

      // LOG ERROR PASO 7
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'strapi_facturacion_creation',
        status: 'error',
        details: `Error registrando facturación en Strapi`,
        error_message: error.message
      });

      // No lanzar error, continuar proceso (Strapi no es crítico para el flujo principal)
      logger.warn(`[Processor] Continuando proceso sin registro en Strapi`);
    }

    // Preparar mensaje final según resultado
    const activationUrl = membershipResult?.activationUrl || null;
    const finalDetails = debeCrearMemberships && activationUrl
      ? `Completado exitosamente. Producto: ${paymentLinkData.product} | Membresías creadas | URL: ${activationUrl} | Factura: ${invoiceResult.numeroFactura}`
      : `Completado. Producto: ${paymentLinkData.product} | NO requiere membresías | Factura: ${invoiceResult.numeroFactura}`;

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

      // Facturación (si se creó factura)
      invoice: invoiceResult ? {
        numeroFactura: invoiceResult.numeroFactura,
        documentoId: invoiceResult.documentoId,
        monto: invoiceResult.monto,
        simulado: invoiceResult.simulado,
        contabilizado: accountingResult ? accountingResult.status === 'OK' : false,
        dian: dianResult ? {
          status: dianResult.dianStatus,
          cufe: dianResult.cufe || 'N/A',
          skipped: dianResult.skipped || false,
          warning: dianResult.warning || false
        } : undefined
      } : undefined,

      // Métricas de performance
      totalRetries: totalRetries,
      processingTimeMs: processingTimeMs
    });

    logger.info(`[Processor] Webhook ${webhook.ref_payco} procesado exitosamente en ${(processingTimeMs / 1000).toFixed(2)}s`);

    // ===================================================================
    // PASO 8: REENVIAR WEBHOOK A ZAPIER
    // ===================================================================
    // Este es el último paso - reenvía el webhook original a Zapier para que
    // otras áreas de la empresa puedan aprovecharlo
    let zapierResult = null;

    try {
      stepTimestamps.paso8 = Date.now();
      logger.info(`[Processor] PASO 8: Reenviando webhook a Zapier`);

      const zapierService = require('./zapierService');
      zapierResult = await zapierService.forwardToZapier(webhook.raw_data);

      if (zapierResult.success) {
        logger.info(`[Processor] ✅ Webhook reenviado a Zapier exitosamente`);
      } else {
        logger.warn(`[Processor] ⚠️ No se pudo reenviar a Zapier: ${zapierResult.error}`);
      }

      // LOG PASO 8: Zapier
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'zapier_forward',
        status: zapierResult.success ? 'success' : 'warning',
        details: zapierResult.success
          ? `Webhook reenviado a Zapier exitosamente`
          : `Error reenviando a Zapier: ${zapierResult.error}`,
        response_data: zapierResult
      });

      const paso8Duration = Date.now() - stepTimestamps.paso8;
      await notificationService.notifyStep(10, 'REENVÍO A ZAPIER', {
        'Status': zapierResult.success ? '✅ Enviado' : '⚠️ Error',
        'Error': zapierResult.error || 'N/A',
        'Resultado': zapierResult.success
          ? `Webhook reenviado correctamente a Zapier`
          : `No se pudo reenviar (no crítico)`
      }, paso8Duration);

    } catch (error) {
      logger.error(`[Processor] Error en PASO 8 (Zapier): ${error.message}`);

      // LOG ERROR PASO 8
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'zapier_forward',
        status: 'warning',
        details: `Error reenviando a Zapier (no crítico)`,
        error_message: error.message
      });

      // No lanzar error - el reenvío a Zapier no es crítico para el flujo principal
      logger.warn(`[Processor] Continuando sin reenvío a Zapier`);
    }

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

    // Clasificar el error
    const errorDetails = getErrorDetails(error);
    const errorContext = getErrorContext(error, webhook?.current_stage || 'unknown');

    // Registrar error en el log
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: webhook?.current_stage || 'error',
      status: 'failed',
      details: errorContext,
      error_message: error.toString()
    });

    // Actualizar webhook con estado de error y información de retriabilidad
    if (webhook) {
      // CRÍTICO: Recargar webhook desde BD para obtener checkpoints guardados
      // Sin esto, webhook.update() sobrescribe con versión vieja y pierde checkpoints
      await webhook.reload();

      const context = webhook.processing_context || {};
      const currentStage = webhook.current_stage || 'unknown';

      // Guardar información del error en el contexto
      context[currentStage] = {
        attempted_at: new Date().toISOString(),
        failed_at: new Date().toISOString(),
        error: errorDetails
      };

      // IMPORTANTE: Usar Webhook.update() en lugar de webhook.update()
      // para actualizar SOLO los campos de error sin tocar completed_stages ni last_completed_stage
      const { Webhook } = require('../models');
      await Webhook.update(
        {
          status: 'error',
          failed_stage: currentStage,
          processing_context: context,
          is_retriable: errorDetails.is_retriable,
          updated_at: new Date()
        },
        {
          where: { id: webhookId }
        }
      );

      // Recargar para reflejar cambios
      await webhook.reload();
    }

    // Enviar notificación de error
    await notificationService.notifyError({
      webhookRef: webhook?.ref_payco,
      invoiceId: webhook?.invoice_id,
      error: error.toString(),
      retriable: errorDetails.is_retriable ? '✅ Retriable' : '❌ Fatal'
    });

    throw error;
  }
}

/**
 * Reprocesa un webhook usando checkpoints para saltar stages ya completados
 * @param {number} webhookId - ID del webhook a reprocesar
 * @param {Object} options - Opciones de reprocesamiento
 * @param {boolean} options.force_restart - Si true, reinicia desde cero ignorando checkpoints
 * @param {string} options.start_from_stage - Stage específico desde donde empezar
 * @param {Array<string>} options.skip_stages - Lista de stages a saltar
 * @param {number} options.max_retries - Número máximo de reintentos permitidos
 * @returns {Promise<Object>} Resultado del reprocesamiento
 * @throws {Error} Si el webhook no es retriable o excede max_retries
 */
async function retryWebhook(webhookId, options = {}) {
  const {
    force_restart = false,
    start_from_stage = null,
    skip_stages = [],
    max_retries = 3
  } = options;

  // Buscar el webhook
  const webhook = await Webhook.findByPk(webhookId);

  if (!webhook) {
    throw new Error(`Webhook ${webhookId} no encontrado`);
  }

  logger.info(`[Retry] Iniciando reprocesamiento de webhook ${webhook.ref_payco}`);

  // Validar retriabilidad
  if (!webhook.is_retriable && !force_restart) {
    throw new Error(
      `Webhook ${webhookId} tiene un error fatal y no puede ser reprocesado automáticamente. ` +
      `Stage fallido: ${webhook.failed_stage}. ` +
      `Usa force_restart=true para intentar desde cero o corrige el error manualmente.`
    );
  }

  // Verificar límite de reintentos
  if (webhook.retry_count >= max_retries && !force_restart) {
    throw new Error(
      `Webhook ${webhookId} ha alcanzado el límite de reintentos (${max_retries}). ` +
      `Requiere intervención manual. ` +
      `Usa force_restart=true para reiniciar el contador.`
    );
  }

  // Si force_restart, limpiar checkpoints y empezar desde cero
  if (force_restart) {
    logger.info(`[Retry] Force restart activado - limpiando checkpoints`);
    await webhook.update({
      completed_stages: [],
      processing_context: {},
      current_stage: null,
      last_completed_stage: null,
      failed_stage: null,
      status: 'pending',
      retry_count: 0, // Reiniciar contador
      is_retriable: true
    });
  }

  // Incrementar contador de reintentos
  await webhook.update({
    retry_count: webhook.retry_count + 1,
    last_retry_at: new Date(),
    status: 'retrying'
  });

  logger.info(`[Retry] Intento ${webhook.retry_count} de ${max_retries}`);
  logger.info(`[Retry] Stages completados previamente: ${webhook.completed_stages.join(', ') || 'ninguno'}`);
  logger.info(`[Retry] Failed stage: ${webhook.failed_stage || 'ninguno'}`);

  if (skip_stages.length > 0) {
    logger.info(`[Retry] Stages a saltar: ${skip_stages.join(', ')}`);
  }

  // TODO: Aquí iría la lógica de reprocesamiento con checkpoints
  // Por ahora, simplemente llamamos al procesador normal
  // En una versión futura, refactorizaremos processWebhook para aceptar checkpoints

  try {
    // NOTA: Por ahora, el processWebhook normal ya guarda checkpoints
    // pero NO los lee para saltar stages. Eso requeriría refactorizar
    // toda la función processWebhook, lo cual es complejo.
    //
    // SOLUCIÓN TEMPORAL: Marcar como "requiere intervención manual"
    // si falla después de 3 reintentos

    const result = await processWebhook(webhookId);

    logger.info(`[Retry] Reprocesamiento exitoso para webhook ${webhookId}`);

    // Resetear campos de error si fue exitoso
    await webhook.update({
      failed_stage: null,
      is_retriable: true,
      status: 'completed'
    });

    return result;

  } catch (error) {
    logger.error(`[Retry] Error en intento ${webhook.retry_count}:`, error);

    // Si alcanzamos max_retries, marcar como "requiere intervención manual"
    if (webhook.retry_count >= max_retries) {
      await webhook.update({
        status: 'requires_manual_intervention',
        is_retriable: false
      });

      logger.error(`[Retry] Webhook ${webhookId} requiere intervención manual después de ${max_retries} intentos`);
    }

    throw error;
  }
}

module.exports = {
  processWebhook,
  retryWebhook
};
