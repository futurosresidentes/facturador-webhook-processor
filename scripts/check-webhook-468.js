/**
 * Script para revisar el webhook 468
 */
require('dotenv').config();
const { Webhook, WebhookLog } = require('../src/models');

async function checkWebhook468() {
  try {
    console.log('🔍 Buscando webhook 468...\n');

    const webhook = await Webhook.findOne({
      where: { id: 468 }
    });

    if (!webhook) {
      console.log('❌ Webhook 468 no encontrado');
      process.exit(1);
    }

    console.log('📦 WEBHOOK 468:');
    console.log('━'.repeat(80));
    console.log(`Estado: ${webhook.status}`);
    console.log(`Referencia: ${webhook.reference}`);
    console.log(`Cliente: ${webhook.customer_id}`);
    console.log(`Email: ${webhook.email}`);
    console.log(`Producto: ${webhook.product_description}`);
    console.log(`Monto: ${webhook.amount} ${webhook.currency}`);
    console.log(`Fecha: ${webhook.created_at}`);
    console.log(`Última actualización: ${webhook.updated_at}`);
    console.log(`Reintentos: ${webhook.retry_count}`);
    console.log('\n📋 MENSAJE DE ERROR:');
    console.log('━'.repeat(80));
    console.log(webhook.error_message || '(sin mensaje de error)');

    if (webhook.processing_context) {
      console.log('\n🔄 CONTEXTO DE PROCESAMIENTO:');
      console.log('━'.repeat(80));
      console.log(JSON.stringify(webhook.processing_context, null, 2));
    }

    if (webhook.completed_stages && webhook.completed_stages.length > 0) {
      console.log('\n✅ STAGES COMPLETADOS:');
      console.log('━'.repeat(80));
      console.log(webhook.completed_stages.join(', '));
      console.log(`\nÚltimo stage completado: ${webhook.last_completed_stage}`);
    }

    // Buscar logs del webhook
    console.log('\n📊 LOGS DEL WEBHOOK:');
    console.log('━'.repeat(80));
    const logs = await WebhookLog.findAll({
      where: { webhook_id: 468 },
      order: [['created_at', 'ASC']]
    });

    if (logs.length === 0) {
      console.log('(sin logs registrados)');
    } else {
      logs.forEach((log, index) => {
        console.log(`\n[${index + 1}] ${log.stage} - ${log.status}`);
        console.log(`Timestamp: ${log.created_at}`);
        if (log.details) console.log(`Detalles: ${log.details}`);
        if (log.error_message) {
          console.log(`❌ Error: ${log.error_message}`);
        }
        if (log.response_data) {
          console.log('Response:', JSON.stringify(log.response_data, null, 2));
        }
      });
    }

    console.log('\n' + '━'.repeat(80));
    process.exit(0);

  } catch (error) {
    console.error('❌ Error al consultar webhook 468:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkWebhook468();
