const axios = require('axios');

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: "TEST_NORM_" + Date.now(),
  x_id_factura: "test-normalization-" + Date.now(),
  x_id_invoice: "test-normalization-" + Date.now(),
  x_description: "Ãlite - 6 meses - Cuota 1",  // ← MAL FORMATEADO A PROPÓSITO
  x_amount: "643334",
  x_amount_country: "643334",
  x_amount_ok: "643334",
  x_tax: "0",
  x_amount_base: "0",
  x_currency_code: "COP",
  x_bank_name: "BANCO DAVIVIENDA",
  x_cardnumber: "*******",
  x_quotas: "0",
  x_respuesta: "Rechazada",  // ← RECHAZADA para no procesar
  x_response: "Rechazada",
  x_approval_code: "",
  x_transaction_id: "TEST_NORM_TXN_" + Date.now(),
  x_fecha_transaccion: new Date().toISOString().slice(0, 19).replace('T', ' '),
  x_transaction_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
  x_cod_respuesta: 3,
  x_cod_response: 3,
  x_response_reason_text: "Rechazada",
  x_errorcode: "03",
  x_cod_transaction_state: 3,
  x_transaction_state: "Rechazada",
  x_franchise: "PSE",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1234567890",
  x_customer_name: "Test",
  x_customer_lastname: "Normalization",
  x_customer_email: "test@normalization.com",
  x_customer_phone: null,
  x_customer_movil: "3001234567",
  x_customer_ind_pais: null,
  x_customer_country: "CO",
  x_customer_city: "Medellín",
  x_customer_address: "Test Address",
  x_customer_ip: "127.0.0.1",
  x_test_request: "TRUE",
  x_signature: "test",
  x_transaction_cycle: "1",
  is_processable: false
};

async function testNormalization() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST DE NORMALIZACIÓN DE PRODUCTO');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📦 Producto enviado:', webhookData.x_description);
    console.log('   (con encoding incorrecto: "Ãlite")\n');

    console.log('🚀 Enviando webhook...\n');

    const url = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

    const response = await axios.post(url, webhookData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ Webhook recibido por el servidor\n');
    console.log('📋 Respuesta del servidor:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    // El servidor devuelve el webhook creado con el producto normalizado
    const webhookId = response.data.id;
    console.log('🔍 Webhook ID:', webhookId);
    console.log('');

    // Esperar 2 segundos para asegurar que se guardó
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Hacer otra petición simple para verificar
    console.log('Verificando producto en el webhook más reciente...');
    const testResponse = await axios.post(url, {
      ...webhookData,
      x_ref_payco: "TEST_VERIFY_" + Date.now(),
      x_id_invoice: "verify-" + Date.now()
    });

    // Por ahora, confiamos que si el servidor respondió OK,
    // la normalización se aplicó. Mejor usar el endpoint PATCH
    // para corregir webhook 88

    console.log('═══════════════════════════════════════════════════════');
    console.log('  RESULTADO');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📦 Producto guardado en BD:', savedWebhook.product);
    console.log('');

    if (savedWebhook.product === 'Élite - 6 meses - Cuota 1') {
      console.log('✅ NORMALIZACIÓN EXITOSA!');
      console.log('   "Ãlite" → "Élite" ✓');
    } else {
      console.log('❌ NORMALIZACIÓN FALLÓ');
      console.log('   Se esperaba: "Élite - 6 meses - Cuota 1"');
      console.log('   Se obtuvo:   "' + savedWebhook.product + '"');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

console.log('⏳ Esperando 5 segundos para que el deploy esté completo...\n');
setTimeout(() => {
  testNormalization();
}, 5000);
