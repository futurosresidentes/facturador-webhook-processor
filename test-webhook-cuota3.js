const axios = require('axios');

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: "TEST_CUOTA3_" + Date.now(),
  x_id_factura: "55414968a8e450b2d97-" + Date.now(),
  x_id_invoice: "55414968a8e450b2d97-" + Date.now(),
  x_description: "Élite - 6 meses - Cuota 3",
  x_amount: 352000,
  x_amount_country: 352000,
  x_amount_ok: 352000,
  x_tax: 0,
  x_amount_base: 0,
  x_currency_code: "COP",
  x_bank_name: "BANCOLOMBIA",
  x_cardnumber: "530691*******2467",
  x_quotas: 1,
  x_respuesta: "Aceptada",
  x_response: "Aceptada",
  x_approval_code: "080628",
  x_transaction_id: "210806675819",
  x_fecha_transaccion: "2025-10-21 08:06:21",
  x_transaction_date: "2025-10-21 08:06:21",
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: "00-Aprobada",
  x_errorcode: "00",
  x_cod_transaction_state: 1,
  x_transaction_state: "Aceptada",
  x_franchise: "MC",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1010208489",
  x_customer_name: "merlin mirley moreno",
  x_customer_lastname: "palacios",
  x_customer_email: "mopa.merlin@gmail.com",
  x_customer_phone: "0000000",
  x_customer_movil: "3116051974",
  x_customer_ind_pais: "CO",
  x_customer_country: "CO",
  x_customer_city: "Bogota",
  x_customer_address: "cll 152 a 7h 17",
  x_customer_ip: "149.88.111.74",
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
  x_extra9_epayco: "payco_link:4501612:1",
  x_tax_ico: 0,
  x_payment_date: "2025-10-21 08:06:30",
  x_signature: "f090a75423b1c73e9c4dc66a8f549b696fbfe0cbb0ba3cf5fcbff2aefa74fd81",
  x_transaction_cycle: null,
  is_processable: true
};

async function sendTestWebhook() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST WEBHOOK - CUOTA 3 (SIN MEMBRESÍAS)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📧 Email:', webhookData.x_customer_email);
    console.log('👤 Cliente:', webhookData.x_customer_name, webhookData.x_customer_lastname);
    console.log('🆔 Cédula:', webhookData.x_customer_document);
    console.log('🏙️  Ciudad:', webhookData.x_customer_city, '(debería encontrar ID de Bogotá)');
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
    console.log('  🏢 Paso 5: World Office (con ciudad Bogotá)');
    console.log('  ✅ Resumen final');
    console.log('');

    const url = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

    const response = await axios.post(url, webhookData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('');
    console.log('Ahora revisa Google Chat para verificar:');
    console.log('  ✓ Paso 3: Debe decir "❌ No requiere membresías"');
    console.log('  ✓ Paso 4: Debe decir "Etiquetas aplicadas: N/A"');
    console.log('  ✓ Paso 5: Debe mostrar ciudad "Bogotá" con su ID correcto');
    console.log('  ✓ Paso 5: Debe mostrar ID Comercial WO (verificar si es 1013 o 2259)');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Ejecutar inmediatamente
sendTestWebhook();
