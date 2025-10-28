/**
 * Script para reenviar el webhook 316160754 que no se procesó
 *
 * Cliente: Diego Carmona
 * Producto: Curso Intensivo UDEA 2026 - Cuota 1
 * Monto: $447,500 COP
 * Fecha original: 2025-10-28 12:38:47
 */

const axios = require('axios');

// Configurar la URL del servidor
const SERVER_URL = process.env.SERVER_URL || 'https://facturador-webhook-processor.onrender.com';

// Endpoint del webhook
const WEBHOOK_ENDPOINT = `${SERVER_URL}/api/webhooks`;

// Datos del webhook original
const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: '316160754',
  x_id_factura: '55414968fac8e6552f6-1761672939278',
  x_id_invoice: '55414968fac8e6552f6-1761672939278',
  x_description: 'Curso Intensivo UDEA 2026 - Cuota 1',
  x_amount: 447500,
  x_amount_country: 447500,
  x_amount_ok: 447500,
  x_tax: 0,
  x_amount_base: 0,
  x_currency_code: 'COP',
  x_bank_name: 'NUBANK',
  x_cardnumber: '555825*******7002',
  x_quotas: 8,
  x_respuesta: 'Aceptada',
  x_response: 'Aceptada',
  x_approval_code: '185788',
  x_transaction_id: '281238777064',
  x_fecha_transaccion: '2025-10-28 12:38:47',
  x_transaction_date: '2025-10-28 12:38:47',
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: '00-Aprobada',
  x_errorcode: '00',
  x_cod_transaction_state: 1,
  x_transaction_state: 'Aceptada',
  x_franchise: 'MC',
  x_business: 'SENTIRE TALLER SAS',
  x_customer_doctype: 'CC',
  x_customer_document: '71382480',
  x_customer_name: 'Diego',
  x_customer_lastname: 'Carmona',
  x_customer_email: 'diegocarm@gmail.com',
  x_customer_phone: '0000000',
  x_customer_movil: '3128954330',
  x_customer_ind_pais: 'CO',
  x_customer_country: 'CO',
  x_customer_city: 'Medellin',
  x_customer_address: 'Cra 84 330',
  x_customer_ip: '191.95.39.31',
  x_test_request: 'FALSE',
  x_extra1: null,
  x_extra2: null,
  x_extra3: null,
  x_extra4: null,
  x_extra5: null,
  x_extra6: null,
  x_extra7: null,
  x_extra8: null,
  x_extra9: null,
  x_extra10: null,
  x_extra9_epayco: 'payco_link:4756924:1',
  x_tax_ico: 0,
  x_payment_date: '2025-10-28 12:38:53',
  x_signature: 'c1fce2ce46b0fb3dfafc39ff01c9f8cb30bf8eb5bc88309522d06141bba02b59',
  x_transaction_cycle: null,
  is_processable: true
};

async function resendWebhook() {
  try {
    console.log('🚀 Reenviando webhook al servidor...');
    console.log('📡 URL:', WEBHOOK_ENDPOINT);
    console.log('📦 Datos del webhook:');
    console.log('   - ref_payco:', webhookData.x_ref_payco);
    console.log('   - Producto:', webhookData.x_description);
    console.log('   - Cliente:', webhookData.x_customer_name, webhookData.x_customer_lastname);
    console.log('   - Email:', webhookData.x_customer_email);
    console.log('   - Monto: $' + webhookData.x_amount.toLocaleString(), webhookData.x_currency_code);
    console.log('\n⏳ Enviando POST request...\n');

    const response = await axios.post(WEBHOOK_ENDPOINT, webhookData, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ePayco-Webhook-Resend'
      },
      timeout: 10000 // 10 segundos de timeout
    });

    console.log('✅ Webhook enviado exitosamente');
    console.log('📊 Respuesta del servidor:');
    console.log('   - Status:', response.status, response.statusText);
    console.log('   - Data:', JSON.stringify(response.data, null, 2));

    if (response.data.webhook_id) {
      console.log('\n🎯 Webhook ID:', response.data.webhook_id);
      console.log('📋 Para ver el progreso:');
      console.log('   GET', `${SERVER_URL}/api/webhooks/${response.data.webhook_id}/logs`);
    }

    console.log('\n✅ Proceso completado');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR al enviar webhook:');

    if (error.response) {
      // El servidor respondió con un código de error
      console.error('📊 Respuesta del servidor:');
      console.error('   - Status:', error.response.status, error.response.statusText);
      console.error('   - Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // La petición se envió pero no hubo respuesta
      console.error('📡 No se recibió respuesta del servidor');
      console.error('   - URL:', WEBHOOK_ENDPOINT);
      console.error('   - Verifica que el servidor esté corriendo');
    } else {
      // Error al configurar la petición
      console.error('⚙️  Error de configuración:', error.message);
    }

    console.error('\n📋 Stack trace:');
    console.error(error.stack);

    process.exit(1);
  }
}

// Ejecutar
resendWebhook();
