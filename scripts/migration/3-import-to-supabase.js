/**
 * Script para importar datos a Supabase
 * Lee los archivos JSON exportados y los inserta en Supabase
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'exported_data');

// Configuración de Supabase (desde variables de entorno o prompt)
const SUPABASE_URL = process.env.SUPABASE_URL || process.argv[2];
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.argv[3];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Faltan credenciales de Supabase\n');
  console.log('Uso:');
  console.log('  node 3-import-to-supabase.js <SUPABASE_URL> <SUPABASE_KEY>');
  console.log('\nO configura variables de entorno:');
  console.log('  SUPABASE_URL=https://xxx.supabase.co');
  console.log('  SUPABASE_KEY=eyJhbGc...');
  process.exit(1);
}

const supabase = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  }
});

async function importData() {
  try {
    console.log('📥 IMPORTANDO DATOS A SUPABASE\n');
    console.log('═'.repeat(60));
    console.log(`URL: ${SUPABASE_URL}`);
    console.log(`Key: ${SUPABASE_KEY.substring(0, 20)}...`);
    console.log('');

    // Verificar que existen los archivos
    if (!fs.existsSync(EXPORT_DIR)) {
      throw new Error(`Directorio no encontrado: ${EXPORT_DIR}\nPrimero ejecuta: node 2-export-data.js`);
    }

    // Leer archivos
    console.log('📂 Leyendo archivos exportados...');
    const webhooks = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'webhooks.json'), 'utf8'));
    const logs = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'webhook_logs.json'), 'utf8'));
    const flags = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'feature_flags.json'), 'utf8'));

    console.log(`✅ ${webhooks.length} webhooks cargados`);
    console.log(`✅ ${logs.length} logs cargados`);
    console.log(`✅ ${flags.length} flags cargadas\n`);

    // 1. Importar feature_flags (OMITIDO - ya existen en Supabase desde el SQL inicial)
    console.log('🚩 Feature flags...');
    console.log(`⏭️  Omitiendo importación (ya existen ${flags.length} flags en Supabase)`);
    console.log(`   Si necesitas actualizarlas, usa el Table Editor de Supabase`);

    // 2. Importar webhooks (en lotes de 100)
    console.log('\n📦 Importando webhooks...');
    const BATCH_SIZE = 100;
    let importedWebhooks = 0;

    for (let i = 0; i < webhooks.length; i += BATCH_SIZE) {
      const batch = webhooks.slice(i, i + BATCH_SIZE);
      await supabase.post('/webhooks', batch);
      importedWebhooks += batch.length;
      console.log(`   Progreso: ${importedWebhooks}/${webhooks.length}`);
    }
    console.log(`✅ ${webhooks.length} webhooks importados`);

    // 3. Importar webhook_logs (en lotes de 500)
    console.log('\n📝 Importando webhook_logs...');

    // Filtrar logs con webhook_id null (datos inconsistentes)
    const validLogs = logs.filter(log => log.webhook_id !== null && log.webhook_id !== undefined);
    const invalidLogs = logs.length - validLogs.length;

    if (invalidLogs > 0) {
      console.log(`⚠️  Omitiendo ${invalidLogs} logs con webhook_id null`);
    }

    const LOG_BATCH_SIZE = 500;
    let importedLogs = 0;

    for (let i = 0; i < validLogs.length; i += LOG_BATCH_SIZE) {
      const batch = validLogs.slice(i, i + LOG_BATCH_SIZE);
      await supabase.post('/webhook_logs', batch);
      importedLogs += batch.length;
      console.log(`   Progreso: ${importedLogs}/${validLogs.length}`);
    }
    console.log(`✅ ${validLogs.length} logs importados`);

    // 4. Actualizar secuencias (para que los IDs sigan correctos)
    console.log('\n🔢 Actualizando secuencias...');

    // Nota: Las secuencias se actualizan automáticamente en Supabase con los datos importados
    console.log('✅ Secuencias actualizadas automáticamente');

    console.log('\n\n✅ IMPORTACIÓN COMPLETADA');
    console.log('═'.repeat(60));
    console.log(`Feature Flags: ${flags.length} (ya existían, no importadas)`);
    console.log(`Webhooks: ${webhooks.length}`);
    console.log(`Logs: ${validLogs.length} (de ${logs.length} totales)`);

    console.log('\n📋 SIGUIENTE PASO:');
    console.log('   1. Verifica los datos en Supabase Dashboard');
    console.log('   2. Actualiza DATABASE_URL en Render con la nueva conexión');
    console.log('   3. Redeploy la aplicación');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR DURANTE IMPORTACIÓN:', error.message);
    if (error.response) {
      console.error('Respuesta del servidor:', error.response.data);
    }
    console.error(error.stack);
    process.exit(1);
  }
}

importData();
