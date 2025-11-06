/**
 * Script para marcar webhook 468 como completado
 * La factura fue contabilizada y emitida a DIAN manualmente
 */
require('dotenv').config();
const { Webhook, WebhookLog } = require('../src/models');

async function patchWebhook468() {
  try {
    console.log('🔧 Actualizando webhook 468...\n');

    const webhook = await Webhook.findOne({
      where: { id: 468 }
    });

    if (!webhook) {
      console.log('❌ Webhook 468 no encontrado');
      process.exit(1);
    }

    console.log('📦 Estado ANTES:');
    console.log(`   Status: ${webhook.status}`);
    console.log(`   Last completed stage: ${webhook.last_completed_stage}`);
    console.log(`   Completed stages: ${webhook.completed_stages?.join(', ') || '(ninguno)'}`);
    console.log(`   Error: ${webhook.error_message || '(sin error)'}`);

    // Obtener contexto actual
    const context = webhook.processing_context || {};
    const completedStages = webhook.completed_stages || [];

    // Agregar checkpoint para worldoffice_invoice_accounting
    context.worldoffice_invoice_accounting = {
      completed_at: new Date().toISOString(),
      data: {
        documentoId: 21334,
        numeroFactura: 25371,
        status: 'contabilizado',
        method: 'manual_patch',
        note: 'Factura contabilizada manualmente en World Office'
      }
    };

    if (!completedStages.includes('worldoffice_invoice_accounting')) {
      completedStages.push('worldoffice_invoice_accounting');
    }

    // Agregar checkpoint para worldoffice_dian_emission
    context.worldoffice_dian_emission = {
      completed_at: new Date().toISOString(),
      data: {
        documentoId: 21334,
        numeroFactura: 25371,
        status: 'emitido',
        method: 'manual_patch',
        note: 'Factura emitida a DIAN manualmente en World Office'
      }
    };

    if (!completedStages.includes('worldoffice_dian_emission')) {
      completedStages.push('worldoffice_dian_emission');
    }

    // Actualizar webhook
    webhook.status = 'completed';
    webhook.processing_context = context;
    webhook.completed_stages = completedStages;
    webhook.last_completed_stage = 'worldoffice_dian_emission';
    webhook.error_message = null;
    webhook.failed_stage = null;

    await webhook.save();

    // Crear logs de éxito para los stages
    await WebhookLog.create({
      webhook_id: 468,
      stage: 'worldoffice_invoice_accounting',
      status: 'success',
      details: 'Factura 25371 contabilizada manualmente en World Office',
      request_payload: null,
      response_data: { documentoId: 21334, numeroFactura: 25371, method: 'manual' },
      error_message: null
    });

    await WebhookLog.create({
      webhook_id: 468,
      stage: 'worldoffice_dian_emission',
      status: 'success',
      details: 'Factura 25371 emitida a DIAN manualmente en World Office',
      request_payload: null,
      response_data: { documentoId: 21334, numeroFactura: 25371, method: 'manual' },
      error_message: null
    });

    await WebhookLog.create({
      webhook_id: 468,
      stage: 'completed',
      status: 'success',
      details: 'Webhook completado exitosamente (contabilización y emisión DIAN realizadas manualmente)',
      request_payload: null,
      response_data: null,
      error_message: null
    });

    console.log('\n✅ Webhook 468 actualizado exitosamente\n');
    console.log('📦 Estado DESPUÉS:');
    console.log(`   Status: ${webhook.status}`);
    console.log(`   Last completed stage: ${webhook.last_completed_stage}`);
    console.log(`   Completed stages: ${webhook.completed_stages.join(', ')}`);
    console.log(`   Error: ${webhook.error_message || '(sin error)'}`);

    console.log('\n📊 Logs agregados:');
    console.log('   ✅ worldoffice_invoice_accounting (success)');
    console.log('   ✅ worldoffice_dian_emission (success)');
    console.log('   ✅ completed (success)');

    console.log('\n' + '━'.repeat(80));
    console.log('🎉 Webhook 468 marcado como completado exitosamente');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error actualizando webhook 468:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

patchWebhook468();
