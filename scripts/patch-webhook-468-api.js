/**
 * Script para marcar webhook 468 como completado via API de producción
 * La factura fue contabilizada y emitida a DIAN manualmente
 */
const axios = require('axios');

const SERVER_URL = 'https://facturador-webhook-processor.onrender.com';
const API_TOKEN = '38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98';

async function patchWebhook468() {
  try {
    console.log('🔧 Actualizando webhook 468 via API...\n');

    // 1. Obtener estado actual del webhook
    console.log('📥 Obteniendo webhook 468...');
    const getResponse = await axios.get(`${SERVER_URL}/api/webhooks?id=468`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    const webhook = getResponse.data.webhook;

    console.log('\n📦 Estado ANTES:');
    console.log(`   Status: ${webhook.status}`);
    console.log(`   Last completed stage: ${webhook.last_completed_stage}`);
    console.log(`   Completed stages: ${webhook.completed_stages?.join(', ') || '(ninguno)'}`);
    console.log(`   Failed stage: ${webhook.failed_stage || '(ninguno)'}`);

    // 2. Preparar datos de actualización
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

    // 3. Actualizar webhook
    console.log('\n📤 Actualizando webhook 468...');
    const patchResponse = await axios.patch(
      `${SERVER_URL}/api/webhooks/468`,
      {
        status: 'completed',
        processing_context: context,
        completed_stages: completedStages,
        last_completed_stage: 'worldoffice_dian_emission',
        error_message: null,
        failed_stage: null
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Webhook actualizado exitosamente\n');
    console.log('📦 Estado DESPUÉS:');
    console.log(`   Status: ${patchResponse.data.webhook.status}`);
    console.log(`   Last completed stage: ${patchResponse.data.webhook.last_completed_stage}`);
    console.log(`   Completed stages: ${patchResponse.data.webhook.completed_stages.join(', ')}`);
    console.log(`   Failed stage: ${patchResponse.data.webhook.failed_stage || '(ninguno)'}`);

    console.log('\n━'.repeat(80));
    console.log('🎉 Webhook 468 marcado como completado exitosamente');
    console.log('\nNOTA: Los logs de los stages ya están en la BD (creación de factura exitosa).');
    console.log('Los stages de contabilización y emisión DIAN ahora aparecen en completed_stages.');

  } catch (error) {
    console.error('\n❌ Error actualizando webhook 468:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

patchWebhook468();
