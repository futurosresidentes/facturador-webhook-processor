/**
 * Controller para reprocesar webhooks (memberships específicamente)
 */

const { Webhook, Membership } = require('../models');
const membershipService = require('../services/membershipService');
const fr360Service = require('../services/fr360Service');
const logger = require('../config/logger');

/**
 * Reprocesa las memberships de un webhook
 * DELETE las memberships simuladas y las recrea usando raw_data
 */
async function reprocessMemberships(req, res) {
  const webhookId = parseInt(req.params.id);

  try {
    logger.info(`[Reprocess] Iniciando reprocesamiento de memberships para webhook ${webhookId}`);

    // 1. Buscar el webhook
    const webhook = await Webhook.findByPk(webhookId);
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: `Webhook ${webhookId} no encontrado`
      });
    }

    // 2. Verificar que tiene raw_data
    if (!webhook.raw_data) {
      return res.status(400).json({
        success: false,
        error: 'Webhook no tiene raw_data para reprocesar'
      });
    }

    const rawData = webhook.raw_data;
    logger.info(`[Reprocess] Webhook encontrado: ${webhook.ref_payco}, Email: ${rawData.x_customer_email}`);

    // 3. Eliminar memberships existentes (simuladas o erróneas)
    const deletedCount = await Membership.destroy({
      where: { webhook_id: webhookId }
    });
    logger.info(`[Reprocess] Eliminadas ${deletedCount} memberships antiguas`);

    // 4. Obtener datos de FR360 (payment link)
    logger.info(`[Reprocess] Consultando payment link en FR360...`);
    const paymentLinkData = await fr360Service.getPaymentLinkData(webhook.invoice_id);

    if (!paymentLinkData) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo obtener datos del payment link en FR360'
      });
    }

    // 5. Crear memberships reales
    logger.info(`[Reprocess] Creando memberships reales en Frapp...`);

    const membershipResult = await membershipService.createMemberships({
      contactId: null, // Se vinculará después si existe
      identityDocument: paymentLinkData.identityDocument,
      email: paymentLinkData.email,
      givenName: paymentLinkData.givenName,
      familyName: paymentLinkData.familyName,
      phone: paymentLinkData.phone,
      product: paymentLinkData.product,
      accessDate: paymentLinkData.accessDate,
      webhookId: webhookId,
      startTimestamp: Date.now()
    });

    logger.info(`[Reprocess] ✅ Memberships creadas: ${membershipResult.membershipsCreadas?.length || 0}`);
    logger.info(`[Reprocess] Activation URL: ${membershipResult.activationUrl || 'N/A'}`);

    // 6. Actualizar processing_context del webhook
    const updatedContext = {
      ...webhook.processing_context,
      fr360Data: paymentLinkData,
      membershipResult: {
        memberships: membershipResult.membershipsCreadas || [],
        activationUrl: membershipResult.activationUrl,
        etiquetas: membershipResult.etiquetas
      }
    };

    await webhook.update({
      processing_context: updatedContext
    });

    // 7. Vincular con contact_id si existe en processing_context
    let contactLinked = false;
    if (webhook.processing_context?.crmContact?.id) {
      const { Contact } = require('../models');
      const crmContactId = webhook.processing_context.crmContact.id;

      const localContact = await Contact.findOne({
        where: { crm_id: crmContactId.toString() }
      });

      if (localContact) {
        const updateCount = await Membership.update(
          { contact_id: localContact.id },
          { where: { webhook_id: webhookId, contact_id: null } }
        );
        contactLinked = updateCount[0] > 0;
        logger.info(`[Reprocess] ${updateCount[0]} memberships vinculadas al contacto local ID ${localContact.id}`);
      }
    }

    // Respuesta exitosa
    return res.status(200).json({
      success: true,
      message: 'Memberships reprocesadas exitosamente',
      data: {
        webhookId: webhookId,
        ref_payco: webhook.ref_payco,
        email: paymentLinkData.email,
        membershipsCreated: membershipResult.membershipsCreadas?.length || 0,
        activationUrl: membershipResult.activationUrl,
        contactLinked: contactLinked,
        deletedOldMemberships: deletedCount
      }
    });

  } catch (error) {
    logger.error(`[Reprocess] Error reprocesando webhook ${webhookId}:`, error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  reprocessMemberships
};
