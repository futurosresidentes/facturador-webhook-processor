const axios = require('axios');

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: "TEST_CITY_" + Date.now(),
  x_id_factura: "55414968f6d0653a317-TEST",
  x_id_invoice: "55414968f6d0653a317-TEST",
  x_description: "Élite - 9 meses - Cuota 1",
  x_amount: "707084",
  x_amount_country: "707084",
  x_amount_ok: "707084",
  x_tax: "0",
  x_amount_base: "0",
  x_currency_code: "COP",
  x_bank_name: "BANCO DAVIVIENDA",
  x_cardnumber: "*******",
  x_quotas: "0",
  x_respuesta: "Aceptada",
  x_response: "Aceptada",
  x_approval_code: "1866675223",
  x_transaction_id: "TEST_TXN_" + Date.now(),
  x_fecha_transaccion: "2025-10-21 03:30:00",
  x_transaction_date: "2025-10-21 03:30:00",
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: "00-Aprobada",
  x_errorcode: "00",
  x_cod_transaction_state: 1,
  x_transaction_state: "Aceptada",
  x_franchise: "PSE",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1016108237",
  x_customer_name: "Laura Stefany Roldan",
  x_customer_lastname: "Quinones",
  x_customer_email: "lauraroldan2702@gmail.com",
  x_customer_phone: null,
  x_customer_movil: "3115550417",
  x_customer_ind_pais: null,
  x_customer_country: "CO",
  x_customer_city: "Medellín",  // ← CIUDAD REAL CON TILDE
  x_customer_address: "TV 52c #2a-47",
  x_customer_ip: "181.61.246.33",
  x_test_request: "FALSE",
  x_extra9_epayco: "payco_link:4743851:1",
  x_tax_ico: "0",
  x_payment_date: "2025-10-21 03:30:00",
  x_signature: "test_signature",
  x_transaction_cycle: "1",
  is_processable: true
};

async function sendTestWebhook() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST CON CIUDAD REAL - Medellín');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('🏙️  Ciudad: Medellín (con tilde)');
    console.log('📍 Esperado: Buscar en caché → ID 1');
    console.log('📧 Email: lauraroldan2702@gmail.com');
    console.log('💳 Ref:', webhookData.x_ref_payco);
    console.log('');
    console.log('🚀 Enviando webhook...');
    console.log('');

    const url = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

    const response = await axios.post(url, webhookData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('');
    console.log('Ahora revisa Google Chat para ver:');
    console.log('👤 DATOS DEL CLIENTE');
    console.log('• Ciudad: Medellín  ← DEBERÍA APARECER');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

sendTestWebhook();
