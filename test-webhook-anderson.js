/**
 * Test específico para webhook de Anderson Potosi
 * Élite - 6 meses por $3,680,000
 */

const axios = require('axios');

const WEBHOOK_URL = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: "314883111",
  x_id_factura: "55414968f6e24537187-1761068120889",
  x_id_invoice: "55414968f6e24537187-1761068120889",
  x_description: "Élite - 6 meses",
  x_amount: "3680000",
  x_amount_country: "3680000",
  x_amount_ok: "3680000",
  x_tax: "0",
  x_amount_base: "0",
  x_currency_code: "COP",
  x_bank_name: "BANCOLOMBIA",
  x_cardnumber: "459425*******4138",
  x_quotas: 1,
  x_respuesta: "Aceptada",
  x_response: "Aceptada",
  x_approval_code: "201725",
  x_transaction_id: "211236556020",
  x_fecha_transaccion: "2025-10-21 12:36:46",
  x_transaction_date: "2025-10-21 12:36:46",
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: "00-Aprobada",
  x_errorcode: "00",
  x_cod_transaction_state: 1,
  x_transaction_state: "Aceptada",
  x_franchise: "VS",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1020794772",
  x_customer_name: "Anderson Enrique",
  x_customer_lastname: "Potosi Lopez",
  x_customer_email: "andersonpotosi@gmail.com",
  x_customer_phone: "0000000",
  x_customer_movil: "3204759828",
  x_customer_ind_pais: "CO",
  x_customer_country: "CO",
  x_customer_city: "Bogota",
  x_customer_address: "Carrera 15 bis 188a 40",
  x_customer_ip: "186.154.35.46",
  x_test_request: "FALSE",
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
  x_extra9_epayco: "payco_link:4743986:1",
  x_tax_ico: "0",
  x_payment_date: "2025-10-21 12:36:51",
  x_signature: "304b39e9850acc3086fe0f77798fb7f76e6686e231fded7fdb75a70e32132f7b",
  x_transaction_cycle: null,
  is_processable: true
};

async function sendWebhook() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST WEBHOOK - ANDERSON POTOSI (Élite 6 meses)');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📧 Email:', webhookData.x_customer_email);
  console.log('👤 Cliente:', webhookData.x_customer_name, webhookData.x_customer_lastname);
  console.log('🆔 Cédula:', webhookData.x_customer_document);
  console.log('🏙️  Ciudad:', webhookData.x_customer_city);
  console.log('📦 Producto:', webhookData.x_description);
  console.log('💰 Monto: $' + parseInt(webhookData.x_amount).toLocaleString('es-CO'));
  console.log('💳 Ref Payco:', webhookData.x_ref_payco);
  console.log('\n🚀 Enviando webhook...\n');

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('📊 Status:', response.status);
    console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📱 Revisa Google Chat para ver el procesamiento paso a paso');
    console.log('⚠️  Este webhook debería probar el sistema de reintentos si hay algún timeout\n');

  } catch (error) {
    console.error('❌ Error enviando webhook:', error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📝 Response:', error.response.data);
    }
  }
}

// Ejecutar inmediatamente (deploy ya terminó)
sendWebhook();
