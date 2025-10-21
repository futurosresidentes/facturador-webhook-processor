/**
 * Script para verificar si un webhook específico fue procesado
 * Busca por Ref Payco o Invoice ID
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configurar conexión a base de datos
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
});

async function checkWebhook(refPayco) {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🔍 BÚSQUEDA DE WEBHOOK EN BASE DE DATOS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`Buscando: Ref Payco = ${refPayco}\n`);

    // Conectar a la base de datos
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');

    // Buscar webhook
    const [webhooks] = await sequelize.query(`
      SELECT
        id,
        ref_payco,
        invoice_id,
        amount,
        customer_email,
        product,
        status,
        created_at,
        updated_at
      FROM webhooks
      WHERE ref_payco = :refPayco
      ORDER BY created_at DESC
    `, {
      replacements: { refPayco },
      type: Sequelize.QueryTypes.SELECT
    });

    if (!webhooks || webhooks.length === 0) {
      console.log('❌ NO SE ENCONTRÓ el webhook en la base de datos');
      console.log('\nPosibles razones:');
      console.log('  1. El webhook nunca llegó al servidor');
      console.log('  2. Falló antes de guardar en la BD');
      console.log('  3. El Ref Payco es incorrecto\n');
      return;
    }

    console.log('✅ WEBHOOK ENCONTRADO:\n');
    console.log('ID:', webhooks.id);
    console.log('Ref Payco:', webhooks.ref_payco);
    console.log('Invoice ID:', webhooks.invoice_id);
    console.log('Email:', webhooks.customer_email);
    console.log('Producto:', webhooks.product);
    console.log('Monto:', webhooks.amount);
    console.log('Status:', webhooks.status);
    console.log('Creado:', webhooks.created_at);
    console.log('Actualizado:', webhooks.updated_at);
    console.log('');

    // Buscar logs del webhook
    const [logs] = await sequelize.query(`
      SELECT
        id,
        stage,
        status,
        details,
        created_at
      FROM webhook_logs
      WHERE webhook_id = :webhookId
      ORDER BY created_at ASC
    `, {
      replacements: { webhookId: webhooks.id },
      type: Sequelize.QueryTypes.SELECT
    });

    if (logs && logs.length > 0) {
      console.log('📋 LOGS DEL PROCESAMIENTO:\n');
      logs.forEach((log, idx) => {
        console.log(`${idx + 1}. [${log.stage}] ${log.status}`);
        console.log(`   ${log.details}`);
        console.log(`   Timestamp: ${log.created_at}\n`);
      });
    } else {
      console.log('⚠️  No se encontraron logs de procesamiento\n');
    }

    // Analizar el resultado
    console.log('═══════════════════════════════════════════════════════');
    console.log('  📊 ANÁLISIS');
    console.log('═══════════════════════════════════════════════════════\n');

    if (webhooks.status === 'completed') {
      console.log('✅ El webhook se procesó COMPLETAMENTE');
      console.log('   • Todas las etapas finalizaron correctamente');
      console.log('   • El problema fue solo en las notificaciones de Google Chat\n');
    } else if (webhooks.status === 'processing') {
      console.log('⚠️  El webhook quedó en estado PROCESSING');
      console.log('   • Se inició el procesamiento pero no terminó');
      console.log('   • Revisar el último log para ver dónde falló\n');
    } else if (webhooks.status === 'failed') {
      console.log('❌ El webhook FALLÓ durante el procesamiento');
      console.log('   • Revisar los logs para identificar el error\n');
    } else {
      console.log(`ℹ️  Estado: ${webhooks.status}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

// Parámetros
const refPayco = process.argv[2] || '314896914';

console.log('');
checkWebhook(refPayco);
