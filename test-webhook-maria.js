const axios = require('axios');

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: "TEST_MARIA_" + Date.now(),
  x_id_factura: "5541496893be2e91160-" + Date.now(),
  x_id_invoice: "5541496893be2e91160-" + Date.now(),
  x_description: "Élite - 9 meses - Cuota 3",
  x_amount: 361375,
  x_amount_country: 361375,
  x_amount_ok: 361375,
  x_tax: 0,
  x_amount_base: 0,
  x_currency_code: "COP",
  x_bank_name: "BANCO DE BOGOTA",
  x_cardnumber: "*******",
  x_quotas: 0,
  x_respuesta: "Aceptada",
  x_response: "Aceptada",
  x_approval_code: "1867149642",
  x_transaction_id: "314802814176105088",
  x_fecha_transaccion: "2025-10-21 07:48:05",
  x_transaction_date: "2025-10-21 07:48:05",
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: "00-Aprobada",
  x_errorcode: "00",
  x_cod_transaction_state: 1,
  x_transaction_state: "Aceptada",
  x_franchise: "PSE",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1043024300",
  x_customer_name: "MARIA JOSE CORONADO",
  x_customer_lastname: "MORALES",
  x_customer_email: "coronadom1406@gmail.com",
  x_customer_phone: null,
  x_customer_movil: "3116517280",
  x_customer_ind_pais: null,
  x_customer_country: "CO",
  x_customer_city: "N/A",
  x_customer_address: "AV 4 -4 22",
  x_customer_ip: "190.121.136.171",
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
  x_extra9_epayco: "payco_link:4450093:1",
  x_tax_ico: 0,
  x_payment_date: "2025-10-21 07:52:09",
  x_signature: "8f46d23555427618c0cc9f522b3e5e14c14ed8a190827332c0190293eb1984fb",
  x_transaction_cycle: "2",
  is_processable: true
};

async function sendTestWebhook() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST WEBHOOK - MARÍA JOSÉ (CUOTA 3)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📧 Email:', webhookData.x_customer_email);
    console.log('👤 Cliente:', webhookData.x_customer_name, webhookData.x_customer_lastname);
    console.log('🆔 Cédula:', webhookData.x_customer_document);
    console.log('🏙️  Ciudad:', webhookData.x_customer_city, '(usará Medellín por defecto)');
    console.log('📦 Producto:', webhookData.x_description);
    console.log('💳 Ref Payco:', webhookData.x_ref_payco);
    console.log('');
    console.log('⚠️  IMPORTANTE: Este es Cuota 3, NO debería crear membresías');
    console.log('');
    console.log('🚀 Enviando webhook...');
    console.log('');
    console.log('Deberías recibir en Google Chat:');
    console.log('  📝 Paso 0: Webhook recibido');
    console.log('  📝 Paso 1: Extracción Invoice ID');
    console.log('  🔍 Paso 2: Consulta FR360');
    console.log('  👥 Paso 3: VERIFICACIÓN (sin membresías)');
    console.log('  🎯 Paso 4: Gestión CRM (sin etiquetas)');
    console.log('  🏢 Paso 5: World Office');
    console.log('  ✅ Resumen final');
    console.log('');
    console.log('🎯 OBJETIVO: Verificar ID Comercial WO');
    console.log('   Comercial: Giancarlo Aguilar Fonnegra');
    console.log('   Cédula comercial: 1001244396');
    console.log('   ID esperado en WO: 1013 (no 2259)');
    console.log('');

    const url = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

    const response = await axios.post(url, webhookData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('');
    console.log('Ahora revisa Google Chat - PASO 5:');
    console.log('  ✓ Ciudad: Medellín (ID: 1)');
    console.log('  ✓ ID Cliente WO: 7593');
    console.log('  ✓ Comercial: Giancarlo Aguilar Fonnegra');
    console.log('  ✓ ID Comercial WO: ¿1013 o 2259? ← VERIFICAR ESTO');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Ejecutar inmediatamente
sendTestWebhook();
