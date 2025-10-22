/**
 * Procesador de webhooks de ePayco
 * Maneja el flujo completo de procesamiento de pagos:
 * 1. Consulta datos del payment link en FR360
 * 2. Crea/actualiza contacto en CRM
 * 3. Crea membresías si el producto lo requiere
 * 4. Envía notificaciones de éxito/error
 */

const { Webhook, WebhookLog, Contact } = require('../models');
const FeatureFlag = require('../models/FeatureFlag');
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
  const stepTimestamps = {}; // Guardar timestamps de inicio de cada paso

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
    stepTimestamps.paso1 = Date.now();
    const invoiceId = webhook.invoice_id.split('-')[0];
    logger.info(`[Processor] Invoice ID extraído: ${invoiceId}`);
    completedStages.invoice_extraction = true;

    // LOG PASO 1: Invoice ID extraído
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'invoice_extraction',
      status: 'success',
      details: `Invoice ID extraído: ${invoiceId} (de ${webhook.invoice_id})`
    });

    // NOTIFICACIÓN PASO 1: Invoice ID extraído
    const paso1Duration = Date.now() - stepTimestamps.paso1;
    await notificationService.notifyStep(1, 'EXTRACCIÓN INVOICE ID', {
      'Invoice ID completo': webhook.invoice_id,
      'Invoice ID extraído': invoiceId,
      'Resultado': '✅ Extracción exitosa'
    }, paso1Duration);

    // STAGE 2: Registrar consulta a FR360
    stepTimestamps.paso2 = Date.now();
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

    // LOG PASO 2: Consulta FR360 exitosa
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'fr360_query',
      status: 'success',
      details: `Datos obtenidos de FR360 - Producto: ${paymentLinkData.product}, Email: ${paymentLinkData.email}, Cliente: ${paymentLinkData.givenName} ${paymentLinkData.familyName}, Cédula: ${paymentLinkData.identityDocument}, Comercial: ${paymentLinkData.salesRep || 'N/A'}`
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

    // STAGE 3: Verificar si el producto requiere creación de membresías
    stepTimestamps.paso3 = Date.now();
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
      const membershipsDetail = membershipResult.membershipsCreadas
        .map((m, idx) => `${idx + 1}. ${m.planNombre} (Plan ID: ${m.membershipPlanId}) - ${m.duracionDias ? `${m.duracionDias} días` : `Hasta ${m.fechaFinFija}`}`)
        .join('; ');

      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'membership_creation',
        status: 'success',
        details: `${membershipResult.membreshipsCreadas.length} membresía(s) creada(s) - ${membershipsDetail}${membershipResult.activationUrl ? ` | activationUrl: ${membershipResult.activationUrl}` : ''}`
      });

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
    stepTimestamps.paso4 = Date.now();
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
      details: `Contacto ${crmAction === 'created' ? 'creado' : 'actualizado'} en CRM - ID: ${contact.id}, Email: ${paymentLinkData.email}, Nombre: ${paymentLinkData.givenName} ${paymentLinkData.familyName}${membershipResult?.activationUrl ? `, activationUrl actualizada` : ''}${etiquetasAplicadas.length > 0 ? `, Etiquetas aplicadas: ${etiquetasAplicadas.join(', ')}` : ''}`
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

    // STAGE 5: Buscar o crear cliente en World Office
    // Esto incluirá la búsqueda de ciudad en el caché
    stepTimestamps.paso5 = Date.now();
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

    // LOG PASO 5: Cliente World Office gestionado
    await WebhookLog.create({
      webhook_id: webhookId,
      stage: 'worldoffice_customer',
      status: 'success',
      details: `Cliente ${woCustomerResult.action === 'created' ? 'creado' : 'encontrado'} en World Office - ID: ${woCustomerResult.customerId}, Cédula: ${paymentLinkData.identityDocument}, Ciudad: ${woCustomerResult.customerData?.cityName || 'N/A'} (ID: ${woCustomerResult.customerData?.cityId || 'N/A'}), Comercial WO ID: ${woCustomerResult.comercialWOId}`
    });

    // NOTIFICACIÓN PASO 5: World Office
    const paso5Duration = Date.now() - stepTimestamps.paso5;
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
    }, paso5Duration);

    // STAGE 6: FACTURACIÓN EN WORLD OFFICE (Crear + Contabilizar + Emitir DIAN)
    logger.info(`[Processor] PASO 6: Facturando en World Office`);

    let invoiceResult = null;
    let accountingResult = null;
    let dianResult = null;

    // PASO 6A: Crear factura
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
        details: `Factura creada ${invoiceResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} - Nro: ${invoiceResult.numeroFactura}, Doc ID: ${invoiceResult.documentoId}, Productos: [${renglonesResumen}], Subtotal: $${subtotal.toLocaleString('es-CO')}, IVA: $${ivaTotal.toLocaleString('es-CO')}, Total: $${parseFloat(webhook.amount).toLocaleString('es-CO')}`
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

    // PASO 6B: Contabilizar factura
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
        details: `Factura contabilizada ${accountingResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, Status: ${accountingResult.status}, Fecha: ${accountingResult.accountingDate}`
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

    // PASO 6C: Emitir ante DIAN
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
          details: `Emisión DIAN desactivada por configuración (WORLDOFFICE_DIAN_ENABLED=false) - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}`
        });

      } else if (dianResult.warning) {
        logger.warn(`[Processor] Factura ya emitida previamente (409)`);
        completedStages.worldoffice_dian = true;

        // LOG PASO 6C: DIAN ya emitida
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'info',
          details: `Factura ya emitida previamente (409) - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, CUFE: ${dianResult.cufe || 'N/A'}`
        });

      } else {
        logger.info(`[Processor] Factura emitida ante DIAN - CUFE: ${dianResult.cufe}`);
        completedStages.worldoffice_dian = true;

        // LOG PASO 6C: DIAN emitida exitosamente
        await WebhookLog.create({
          webhook_id: webhookId,
          stage: 'worldoffice_dian_emission',
          status: 'success',
          details: `Factura emitida ${dianResult.simulado ? '(TESTING)' : '(PRODUCCIÓN)'} ante DIAN - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}, CUFE: ${dianResult.cufe}, Status DIAN: ${dianResult.dianStatus}, Fecha: ${dianResult.emittedAt}`
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

    } catch (error) {
      logger.error(`[Processor] Error emitiendo factura ante DIAN: ${error.message}`);

      // LOG ERROR PASO 6C: Error en emisión DIAN
      await WebhookLog.create({
        webhook_id: webhookId,
        stage: 'worldoffice_dian_emission',
        status: 'error',
        details: `Error emitiendo factura ante DIAN - Doc ID: ${invoiceResult.documentoId}, Nro: ${invoiceResult.numeroFactura}`,
        error_message: error.message
      });

      // No lanzar error, continuar proceso (emisión DIAN no es crítica)
      logger.warn(`[Processor] Continuando proceso sin emisión DIAN`);
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
