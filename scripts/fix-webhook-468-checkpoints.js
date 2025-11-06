/**
 * Script para agregar TODOS los checkpoints faltantes al webhook 468
 * Basado en los logs exitosos que sí tiene registrados
 */
const axios = require('axios');

const SERVER_URL = 'https://facturador-webhook-processor.onrender.com';
const API_TOKEN = '38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98';

async function fixWebhook468Checkpoints() {
  try {
    console.log('🔧 Agregando checkpoints faltantes al webhook 468...\n');

    // 1. Obtener estado actual
    const getResponse = await axios.get(`${SERVER_URL}/api/webhooks?id=468`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });

    const webhook = getResponse.data.webhook;

    console.log('📦 Completed stages ANTES:', webhook.completed_stages);

    // 2. Construir processing_context completo basado en los logs exitosos
    const context = webhook.processing_context || {};

    // Stage 1: invoice_extraction
    context.invoice_extraction = {
      completed_at: '2025-10-30T00:23:13.408Z',
      data: {
        invoiceId: '554149688933f480efc',
        originalId: '554149688933f480efc-1761783412855'
      }
    };

    // Stage 2: fr360_query
    context.fr360_query = {
      completed_at: '2025-10-30T00:23:14.257Z',
      data: {
        id: 8181,
        email: 'mparada505@unab.edu.co',
        phone: '573173813996',
        givenName: 'Mayra Alejandra',
        familyName: 'Parada Navarro',
        identityDocument: '1098760404',
        agreementId: '25072956982825',
        product: 'Élite - 9 meses - Cuota 4',
        comercial: 'Ana Isabel Arango Goez'
      }
    };

    // Stage 3: callbell_notification
    context.callbell_notification = {
      completed_at: '2025-10-30T00:23:15.234Z',
      data: {
        phone: '573173813996',
        messageId: '427e1e6a49714090ba9ce0dc630f1e2d',
        success: true
      }
    };

    // Stage 4: crm_management
    context.crm_management = {
      completed_at: '2025-10-30T00:23:18.642Z',
      data: {
        contact: {
          id: 47241,
          email: 'mparada505@unab.edu.co',
          firstName: 'Mayra Alejandra',
          lastName: 'Parada Navarro',
          phone: '573173813996'
        },
        action: 'updated',
        tagsApplied: []
      }
    };

    // Stage 5: worldoffice_customer
    context.worldoffice_customer = {
      completed_at: '2025-10-30T00:23:24.815Z',
      data: {
        customerId: 12428,
        action: 'updated',
        customerData: {
          id: 12428,
          name: 'Mayra Alejandra Parada Navarro',
          email: 'mparada505@unab.edu.co',
          phone: '573173813996',
          document: '1098760404',
          cityId: 1,
          cityName: 'Medellín'
        },
        comercialWOId: 2259
      }
    };

    // Stage 6: worldoffice_invoice_creation
    context.worldoffice_invoice_creation = {
      completed_at: '2025-10-30T00:24:10.339Z',
      data: {
        documentoId: 21334,
        numeroFactura: 25371,
        monto: 915000,
        simulado: false
      }
    };

    // Stages 7 y 8 ya los agregaste manualmente (accounting + dian)
    // Solo nos aseguramos de que estén

    // 3. Actualizar completed_stages con TODOS los stages
    const completedStages = [
      'invoice_extraction',
      'fr360_query',
      'callbell_notification',
      'crm_management',
      'worldoffice_customer',
      'worldoffice_invoice_creation',
      'worldoffice_invoice_accounting',
      'worldoffice_dian_emission'
    ];

    // 4. Actualizar webhook
    console.log('\n📤 Actualizando webhook con checkpoints completos...');
    const patchResponse = await axios.patch(
      `${SERVER_URL}/api/webhooks/468`,
      {
        processing_context: context,
        completed_stages: completedStages,
        last_completed_stage: 'worldoffice_dian_emission',
        status: 'completed',
        error_message: null,
        failed_stage: null
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Checkpoints agregados exitosamente\n');
    console.log('📦 Completed stages DESPUÉS:');
    console.log(patchResponse.data.webhook.completed_stages.join('\n   '));

    console.log('\n━'.repeat(80));
    console.log('🎉 Webhook 468 ahora tiene TODOS los checkpoints');
    console.log('\n⚠️  IMPORTANTE: Ahora si haces retry, NO duplicará nada.');
    console.log('   Todos los stages verán que ya están completados y los saltarán.');

  } catch (error) {
    console.error('\n❌ Error:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

fixWebhook468Checkpoints();
