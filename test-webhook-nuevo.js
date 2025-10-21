/**
 * Test con webhook completamente nuevo
 * Para verificar:
 * - Sistema de reintentos de World Office
 * - Corrección de IVA (0%) para FR Libros
 * - ISBNs visibles en notificaciones
 * - Payload completo en logs
 */

const axios = require('axios');

const WEBHOOK_URL = 'https://facturador-webhook-processor.onrender.com/api/webhooks';

// Generar ref_payco único
const uniqueRef = "TEST_RETRY_" + Date.now();
const uniqueInvoice = "INV_TEST_" + Date.now();

const webhookData = {
  x_cust_id_cliente: 554149,
  x_ref_payco: uniqueRef,
  x_id_factura: uniqueInvoice,
  x_id_invoice: uniqueInvoice,
  x_description: "Élite - 9 meses - Cuota 1",
  x_amount: "707084",
  x_amount_country: "707084",
  x_amount_ok: "707084",
  x_tax: "0",
  x_amount_base: "0",
  x_currency_code: "COP",
  x_bank_name: "BANCOLOMBIA",
  x_cardnumber: "459425*******4138",
  x_quotas: 1,
  x_respuesta: "Aceptada",
  x_response: "Aceptada",
  x_approval_code: "123456",
  x_transaction_id: "987654321",
  x_fecha_transaccion: "2025-10-21 13:10:00",
  x_transaction_date: "2025-10-21 13:10:00",
  x_cod_respuesta: 1,
  x_cod_response: 1,
  x_response_reason_text: "00-Aprobada",
  x_errorcode: "00",
  x_cod_transaction_state: 1,
  x_transaction_state: "Aceptada",
  x_franchise: "VS",
  x_business: "SENTIRE TALLER SAS",
  x_customer_doctype: "CC",
  x_customer_document: "1234567890",
  x_customer_name: "Maria Camila",
  x_customer_lastname: "Rodriguez Gomez",
  x_customer_email: "test.retry@gmail.com",
  x_customer_phone: "3001234567",
  x_customer_movil: "3001234567",
  x_customer_ind_pais: "CO",
  x_customer_country: "CO",
  x_customer_city: "Medellin",
  x_customer_address: "Calle 50 # 45-30",
  x_customer_ip: "192.168.1.1",
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
  x_extra9_epayco: "payco_link:test:1",
  x_tax_ico: "0",
  x_payment_date: "2025-10-21 13:10:05",
  x_signature: "test_signature_" + Date.now(),
  x_transaction_cycle: null,
  is_processable: true
};

async function sendWebhook() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🧪 TEST WEBHOOK NUEVO - SISTEMA DE REINTENTOS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('🔍 VERIFICACIONES EN ESTE TEST:');
  console.log('   ✅ Sistema de reintentos (5 intentos, 1 segundo)');
  console.log('   ✅ IVA correcto (0%) para FR Libros');
  console.log('   ✅ ISBNs visibles en notificación');
  console.log('   ✅ Payload completo en logs de Render\n');

  console.log('📦 DATOS DEL WEBHOOK:');
  console.log('   • Email:', webhookData.x_customer_email);
  console.log('   • Cliente:', webhookData.x_customer_name, webhookData.x_customer_lastname);
  console.log('   • Cédula:', webhookData.x_customer_document);
  console.log('   • Ciudad:', webhookData.x_customer_city);
  console.log('   • Producto:', webhookData.x_description);
  console.log('   • Monto: $' + parseInt(webhookData.x_amount).toLocaleString('es-CO'));
  console.log('   • Ref Payco:', uniqueRef);
  console.log('   • Invoice ID:', uniqueInvoice);
  console.log('\n🚀 Enviando webhook...\n');

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('✅ Webhook enviado exitosamente!');
    console.log('📊 Status:', response.status);
    console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📱 REVISA GOOGLE CHAT PARA VER:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('PASO 6: CREACIÓN DE FACTURA (WORLD OFFICE)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Deberías ver:');
    console.log('   1️⃣ Producto: FR Libros (ID: 1010)');
    console.log('      • Valor unitario: $707,084.00 (sin IVA)');
    console.log('      • IVA: $0.00 (exento) ✅ CORRECTO');
    console.log('      • Total: $707,084.00 ✅ CORRECTO');
    console.log('      • ISBNs: ISBNS: 978-628-95885-0-7, 978-628-95885-2-1 ✅ VISIBLE');
    console.log('');
    console.log('📊 RESUMEN FINANCIERO:');
    console.log('   • Subtotal (sin IVA): $707,084.00');
    console.log('   • IVA total: $0.00 ✅ CORRECTO');
    console.log('   • Total factura: $707,084.00');
    console.log('');
    console.log('🔧 Si hay algún timeout en World Office:');
    console.log('   • Verás en logs: "Intento 1/5", "Intento 2/5", etc.');
    console.log('   • Sistema reintentará automáticamente');
    console.log('   • Proceso continuará si algún intento tiene éxito');
    console.log('');

  } catch (error) {
    console.error('❌ Error enviando webhook:', error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📝 Response:', error.response.data);
    }
  }
}

sendWebhook();
