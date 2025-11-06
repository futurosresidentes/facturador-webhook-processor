/**
 * Script para exportar datos desde Render PostgreSQL
 * Genera archivos JSON con todos los datos
 */
require('dotenv').config();
const { Webhook, WebhookLog, FeatureFlag } = require('../../src/models');
const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'exported_data');

async function exportData() {
  try {
    console.log('📤 EXPORTANDO DATOS DESDE RENDER PostgreSQL\n');
    console.log('═'.repeat(60));

    // Crear directorio de export si no existe
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
      console.log(`✅ Directorio creado: ${EXPORT_DIR}\n`);
    }

    // 1. Exportar webhooks
    console.log('\n📦 Exportando webhooks...');
    const webhooks = await Webhook.findAll({
      order: [['id', 'ASC']],
      raw: true
    });

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'webhooks.json'),
      JSON.stringify(webhooks, null, 2)
    );
    console.log(`✅ ${webhooks.length} webhooks exportados`);

    // 2. Exportar webhook_logs
    console.log('\n📝 Exportando webhook_logs...');
    const logs = await WebhookLog.findAll({
      order: [['id', 'ASC']],
      raw: true
    });

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'webhook_logs.json'),
      JSON.stringify(logs, null, 2)
    );
    console.log(`✅ ${logs.length} logs exportados`);

    // 3. Exportar feature_flags
    console.log('\n🚩 Exportando feature_flags...');
    const flags = await FeatureFlag.findAll({
      order: [['id', 'ASC']],
      raw: true
    });

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'feature_flags.json'),
      JSON.stringify(flags, null, 2)
    );
    console.log(`✅ ${flags.length} feature flags exportadas`);

    // 4. Crear resumen
    const summary = {
      export_date: new Date().toISOString(),
      total_webhooks: webhooks.length,
      total_logs: logs.length,
      total_flags: flags.length,
      oldest_webhook: webhooks[0]?.created_at,
      newest_webhook: webhooks[webhooks.length - 1]?.created_at
    };

    fs.writeFileSync(
      path.join(EXPORT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n\n📊 RESUMEN DE EXPORTACIÓN');
    console.log('─'.repeat(60));
    console.log(`Total webhooks: ${summary.total_webhooks}`);
    console.log(`Total logs: ${summary.total_logs}`);
    console.log(`Total flags: ${summary.total_flags}`);
    console.log(`\nWebhook más antiguo: ${summary.oldest_webhook}`);
    console.log(`Webhook más reciente: ${summary.newest_webhook}`);

    console.log('\n\n✅ EXPORTACIÓN COMPLETADA');
    console.log('─'.repeat(60));
    console.log(`Archivos guardados en: ${EXPORT_DIR}`);
    console.log('\nArchivos generados:');
    console.log('  - webhooks.json');
    console.log('  - webhook_logs.json');
    console.log('  - feature_flags.json');
    console.log('  - summary.json');

    console.log('\n📋 SIGUIENTE PASO:');
    console.log('   Ejecutar: node scripts/migration/3-import-to-supabase.js');
    console.log('   (después de configurar SUPABASE_URL y SUPABASE_KEY)');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR DURANTE EXPORTACIÓN:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

exportData();
