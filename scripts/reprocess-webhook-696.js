/**
 * Script para reprocesar el webhook 696
 * Elimina memberships simuladas y reprocesa solo el stage de memberships
 */

const { Webhook, Membership } = require('../src/models');
const membershipService = require('../src/services/membershipService');
const logger = require('../src/config/logger');

async function reprocessWebhook696() {
  const webhookId = 696;

  try {
    logger.info('=== Iniciando reprocesamiento del webhook 696 ===');

    // 1. Buscar el webhook
    const webhook = await Webhook.findByPk(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} no encontrado`);
    }

    logger.info(`Webhook encontrado: ${webhook.ref_payco}`);
    logger.info(`Status actual: ${webhook.status}`);
    logger.info(`Stages completados: ${webhook.completed_stages}`);

    // 2. Eliminar memberships simuladas
    const deletedCount = await Membership.destroy({
      where: { webhook_id: webhookId }
    });
    logger.info(`✅ Eliminadas ${deletedCount} memberships simuladas`);

    // 3. Obtener datos del processing_context
    const fr360Data = webhook.processing_context?.fr360Data;
    if (!fr360Data) {
      throw new Error('No hay datos de FR360 en processing_context para reprocesar');
    }

    logger.info(`Datos recuperados: ${fr360Data.email}`);

    // 4. Crear memberships reales
    logger.info('Creando memberships reales en Frapp...');

    const membershipResult = await membershipService.createMemberships({
      contactId: null, // Se vinculará después
      identityDocument: fr360Data.identityDocument,
      email: fr360Data.email,
      givenName: fr360Data.givenName,
      familyName: fr360Data.familyName,
      phone: fr360Data.phone,
      product: webhook.product,
      accessDate: fr360Data.accessDate,
      webhookId: webhookId,
      startTimestamp: Date.now()
    });

    logger.info(`✅ Memberships creadas: ${membershipResult.membershipsCreadas?.length || 0}`);
    logger.info(`Activation URL: ${membershipResult.activationUrl || 'N/A'}`);

    // 5. Actualizar processing_context del webhook con el nuevo resultado
    const updatedContext = {
      ...webhook.processing_context,
      membershipResult: {
        memberships: membershipResult.membershipsCreadas || [],
        activationUrl: membershipResult.activationUrl,
        etiquetas: membershipResult.etiquetas
      }
    };

    await webhook.update({
      processing_context: updatedContext
    });

    // 6. Vincular memberships con contact_id si existe
    if (webhook.processing_context?.crmContact?.id) {
      const { Contact } = require('../src/models');
      const crmContactId = webhook.processing_context.crmContact.id;

      // Buscar el contacto local por crm_id
      const localContact = await Contact.findOne({
        where: { crm_id: crmContactId.toString() }
      });

      if (localContact) {
        const updateCount = await Membership.update(
          { contact_id: localContact.id },
          { where: { webhook_id: webhookId, contact_id: null } }
        );
        logger.info(`✅ ${updateCount[0]} memberships vinculadas al contacto local ID ${localContact.id}`);
      }
    }

    logger.info('=== ✅ Reprocesamiento completado exitosamente ===');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Error reprocesando webhook 696:', error);
    process.exit(1);
  }
}

// Ejecutar
reprocessWebhook696();
