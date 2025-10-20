/**
 * Script de prueba para enviar un webhook local
 * Ejecutar con: node test-webhook.js
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Webhook de prueba (basado en datos reales)
const testWebhook = {
  x_cust_id_cliente: 554149,
  x_ref_payco: '314558422',
  x_id_factura: '55414968f6267e7201f-1760962314022',
  x_id_invoice: '55414968f6267e7201f-1760962314022',
  x_description: 'Élite - 6 meses - Cuota 1',
  x_amount: 643334,
  x_amount_country: 643334,
  x_amount_ok: 643334,
  x_tax: 0,
  x_amount_base: 0,
  x_currency_code: 'COP',
  x_bank_name: 'BANCO DE BOGOTA',
  x_cardnumber: '*******',
  x_quotas: 0,
  x_respuesta: 'Aceptada',
  x_response: 'Aceptada',
  x_approval_code: '1865295105',
  x_transaction_id: '314558422176096239',
  x_fecha_transaccion: '2025-10-20 07:13:13',
  x_transaction_date: '2025-10-20 07:13:13',
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: '00-Aprobada',
  x_errorcode: '00',
  x_cod_transaction_state: 1,
  x_transaction_state: 'Aceptada',
  x_franchise: 'PSE',
  x_business: 'SENTIRE TALLER SAS',
  x_customer_doctype: 'CC',
  x_customer_document: '1001192397',
  x_customer_name: 'Paola',
  x_customer_lastname: 'Chaves',
  x_customer_email: 'natachaves1@gmail.com',
  x_customer_phone: '3246827553',
  x_customer_movil: '3246827553',
  x_customer_ind_pais: null,
  x_customer_country: 'CO',
  x_customer_city: 'N/A',
  x_customer_address: 'Cra 72 a bis a #11b-59',
  x_customer_ip: '191.95.54.133',
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
  x_extra9_epayco: 'payco_link:4739429:1',
  x_tax_ico: 0,
  x_payment_date: '2025-10-20 07:14:06',
  x_signature: '2b1f7a0bd7141cca5c9d994963775a7c1c462b85aac9fc7d5c29ab7d8414c93f',
  x_transaction_cycle: '2',
  is_processable: true
};

async function testWebhookEndpoint() {
  try {
    console.log('\n====================================');
    console.log('Testing Webhook Endpoint');
    console.log('====================================\n');
    console.log(`URL: ${BASE_URL}/api/webhooks`);
    console.log(`Producto: ${testWebhook.x_description}`);
    console.log(`Email: ${testWebhook.x_customer_email}`);
    console.log(`Monto: ${testWebhook.x_amount} ${testWebhook.x_currency_code}\n`);

    const response = await axios.post(`${BASE_URL}/api/webhooks`, testWebhook, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('\nRespuesta del servidor:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.id) {
      console.log(`\nPara ver el webhook: ${BASE_URL}/api/webhooks/${response.data.id}`);
    }

  } catch (error) {
    console.error('❌ Error enviando webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

async function testHealthEndpoint() {
  try {
    console.log('\n====================================');
    console.log('Testing Health Endpoint');
    console.log('====================================\n');

    const response = await axios.get(`${BASE_URL}/health`);

    console.log('✅ Server is healthy!');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Server is not healthy:');
    console.error(error.message);
  }
}

// Ejecutar pruebas
async function runTests() {
  await testHealthEndpoint();
  console.log('\n');
  await testWebhookEndpoint();
}

runTests();
