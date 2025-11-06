/**
 * Script para exportar datos via API (cuando no hay acceso directo a BD de Render)
 * Usa el endpoint /api/webhooks para obtener todos los webhooks y sus logs
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://facturador-webhook-processor.onrender.com';
const API_TOKEN = process.env.API_TOKEN || process.argv[2];

if (!API_TOKEN) {
  console.error('❌ ERROR: Falta el token de API\n');
  console.log('Uso:');
  console.log('  node 2-export-data-via-api.js <API_TOKEN>');
  console.log('\nO configura variable de entorno:');
  console.log('  API_TOKEN=38af4464619...');
  process.exit(1);
}

const EXPORT_DIR = path.join(__dirname, 'exported_data');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function exportDataViaAPI() {
  try {
    console.log('📤 EXPORTANDO DATOS VIA API\n');
    console.log('═'.repeat(60));

    // Crear directorio de export si no existe
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
      console.log(`✅ Directorio creado: ${EXPORT_DIR}\n`);
    }

    const headers = {
      'Authorization': `Bearer ${API_TOKEN}`
    };

    // 1. Obtener el rango de IDs (del más antiguo al más nuevo)
    console.log('📊 Obteniendo rango de webhooks...');

    // Webhook más antiguo
    const oldestRes = await axios.get(`${API_URL}/api/webhooks?limit=1&order=id&dir=ASC`, { headers });
    const oldestWebhook = oldestRes.data.webhooks?.[0] || oldestRes.data.webhook;
    const oldestId = oldestWebhook.id;

    // Webhook más reciente
    const newestRes = await axios.get(`${API_URL}/api/webhooks?limit=1&order=id&dir=DESC`, { headers });
    const newestWebhook = newestRes.data.webhooks?.[0] || newestRes.data.webhook;
    const newestId = newestWebhook.id;

    const totalWebhooks = newestId - oldestId + 1;
    console.log(`✅ Rango: ID ${oldestId} a ${newestId} (${totalWebhooks} webhooks)\n`);

    // 2. Exportar cada webhook con sus logs
    console.log('📦 Exportando webhooks con logs...');
    const allWebhooks = [];
    const allLogs = [];
    let exportedCount = 0;
    let failedIds = [];

    for (let id = oldestId; id <= newestId; id++) {
      try {
        const response = await axios.get(`${API_URL}/api/webhooks?id=${id}`, { headers });

        if (response.data.success && response.data.webhook) {
          const webhook = response.data.webhook;
          const logs = response.data.webhook.logs?.all || [];

          // Guardar webhook (sin logs anidados)
          const webhookData = { ...webhook };
          delete webhookData.logs; // Remover logs para evitar duplicación
          allWebhooks.push(webhookData);

          // Guardar logs por separado (agregar webhook_id a cada log)
          logs.forEach(log => {
            allLogs.push({
              ...log,
              webhook_id: webhook.id
            });
          });

          exportedCount++;

          // Progreso cada 50 webhooks
          if (exportedCount % 50 === 0) {
            console.log(`   Progreso: ${exportedCount}/${totalWebhooks} (${((exportedCount/totalWebhooks)*100).toFixed(1)}%)`);
          }
        }
      } catch (error) {
        // Si el webhook no existe (fue eliminado), continuar
        if (error.response?.status === 404) {
          failedIds.push(id);
        } else {
          console.error(`   ⚠️  Error en webhook ${id}: ${error.message}`);
        }
      }

      // Rate limiting: esperar 50ms entre requests
      await sleep(50);
    }

    console.log(`✅ ${exportedCount} webhooks exportados`);
    if (failedIds.length > 0) {
      console.log(`⚠️  ${failedIds.length} webhooks no encontrados (IDs: ${failedIds.slice(0, 10).join(', ')}${failedIds.length > 10 ? '...' : ''})`);
    }

    // 3. Guardar webhooks
    fs.writeFileSync(
      path.join(EXPORT_DIR, 'webhooks.json'),
      JSON.stringify(allWebhooks, null, 2)
    );
    console.log(`\n📝 Archivo creado: webhooks.json (${allWebhooks.length} registros)`);

    // 4. Guardar logs
    fs.writeFileSync(
      path.join(EXPORT_DIR, 'webhook_logs.json'),
      JSON.stringify(allLogs, null, 2)
    );
    console.log(`📝 Archivo creado: webhook_logs.json (${allLogs.length} registros)`);

    // 5. Feature flags (ya están en Supabase, crear archivo vacío para consistencia)
    const flagsTemplate = [
      { key: 'WORLDOFFICE_INVOICE_ENABLED', value: true, description: 'Activar creación de facturas en World Office' },
      { key: 'WORLDOFFICE_ACCOUNTING_ENABLED', value: true, description: 'Activar contabilización de facturas en World Office' },
      { key: 'WORLDOFFICE_DIAN_ENABLED', value: false, description: 'Activar emisión electrónica ante la DIAN en World Office' },
      { key: 'FRAPP_MEMBERSHIP_ENABLED', value: true, description: 'Activar creación de membresías en Frapp' },
      { key: 'STRAPI_FACTURACION_ENABLED', value: true, description: 'Activar registro de facturaciones en Strapi' }
    ];

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'feature_flags.json'),
      JSON.stringify(flagsTemplate, null, 2)
    );
    console.log(`📝 Archivo creado: feature_flags.json (${flagsTemplate.length} registros)`);

    // 6. Crear resumen
    const summary = {
      export_date: new Date().toISOString(),
      export_method: 'API',
      total_webhooks: allWebhooks.length,
      total_logs: allLogs.length,
      total_flags: flagsTemplate.length,
      oldest_webhook: allWebhooks[0]?.created_at,
      newest_webhook: allWebhooks[allWebhooks.length - 1]?.created_at,
      failed_ids: failedIds
    };

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n\n📊 RESUMEN DE EXPORTACIÓN');
    console.log('─'.repeat(60));
    console.log(`Webhooks exportados: ${summary.total_webhooks}`);
    console.log(`Logs exportados: ${summary.total_logs}`);
    console.log(`Feature flags: ${summary.total_flags}`);
    console.log(`\nWebhook más antiguo: ${summary.oldest_webhook}`);
    console.log(`Webhook más reciente: ${summary.newest_webhook}`);

    console.log('\n\n✅ EXPORTACIÓN COMPLETADA');
    console.log('═'.repeat(60));
    console.log(`Archivos guardados en: ${EXPORT_DIR}`);
    console.log('\nArchivos generados:');
    console.log('  ✅ webhooks.json');
    console.log('  ✅ webhook_logs.json');
    console.log('  ✅ feature_flags.json (ya están en Supabase)');
    console.log('  ✅ summary.json');

    console.log('\n📋 SIGUIENTE PASO:');
    console.log('   Ejecutar: node scripts/migration/3-import-to-supabase.js');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR DURANTE EXPORTACIÓN:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

exportDataViaAPI();
