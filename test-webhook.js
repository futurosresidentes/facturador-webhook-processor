/**
 * Script de prueba para enviar un webhook local
 * Ejecutar con: node test-webhook.js
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Webhook de prueba (basado en datos reales)
const testWebhook = {
  x_cust_id_cliente: 554149,
  x_ref_payco: '314525019',
  x_id_factura: '554149685168e-1729364726170',
  x_id_invoice: '554149685168e-1729364726170',
  x_description: 'Élite - 12 meses - Cuota 1',
  x_amount: 424265,
  x_amount_country: 424265,
  x_amount_ok: 424265,
  x_tax: 0,
  x_amount_base: 424265,
  x_currency_code: 'COP',
  x_bank_name: 'NA',
  x_cardnumber: '******',
  x_quotas: 0,
  x_respuesta: 'Aceptada',
  x_response: 'Aceptada',
  x_approval_code: '',
  x_transaction_id: '12345678',
  x_fecha_transaccion: '2025-10-19 19:51:58',
  x_transaction_date: '2025-10-19 19:51:58',
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: 'Aprobada',
  x_errorcode: '',
  x_cod_transaction_state: 0,
  x_transaction_state: 'Aceptada',
  x_franchise: 'NA',
  x_business: 'NA',
  x_customer_doctype: 'CC',
  x_customer_document: '1005256810',
  x_customer_name: 'Maria Paula',
  x_customer_lastname: 'Espinosa Leon',
  x_customer_email: 'test@example.com',
  x_customer_phone: '3112275745',
  x_customer_movil: '',
  x_customer_ind_pais: '+57',
  x_customer_country: 'CO',
  x_customer_city: '',
  x_customer_address: '',
  x_customer_ip: '123.45.67.89',
  x_test_request: 'FALSE',
  x_extra1: '',
  x_extra2: '',
  x_extra3: '',
  x_extra4: '',
  x_extra5: '',
  x_extra6: '',
  x_extra7: '',
  x_extra8: '',
  x_extra9: '',
  x_extra10: '',
  x_extra9_epayco: 'payco_link:4277232:1',
  x_tax_ico: 0,
  x_payment_date: '2025-10-19 17:13:26',
  x_signature: 'test_signature_123',
  x_transaction_cycle: '',
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
