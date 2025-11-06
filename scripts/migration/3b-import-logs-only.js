/**
 * Script para importar SOLO los logs a Supabase
 * Usado cuando los webhooks ya fueron importados pero los logs fallaron
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
  console.log('  node 3b-import-logs-only.js <SUPABASE_URL> <SUPABASE_KEY>');
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

async function importLogsOnly() {
  try {
    console.log('📥 IMPORTANDO LOGS A SUPABASE\n');
    console.log('═'.repeat(60));
    console.log(`URL: ${SUPABASE_URL}`);
    console.log(`Key: ${SUPABASE_KEY.substring(0, 20)}...`);
    console.log('');

    // Verificar que existen los archivos
    if (!fs.existsSync(EXPORT_DIR)) {
      throw new Error(`Directorio no encontrado: ${EXPORT_DIR}\nPrimero ejecuta: node 2-export-data-via-api.js`);
    }

    // Leer archivo de logs
    console.log('📂 Leyendo archivo de logs...');
    const logs = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'webhook_logs.json'), 'utf8'));
    console.log(`✅ ${logs.length} logs cargados\n`);

    // Filtrar logs con webhook_id null (datos inconsistentes)
    const validLogs = logs.filter(log => log.webhook_id !== null && log.webhook_id !== undefined);
    const invalidLogs = logs.length - validLogs.length;

    if (invalidLogs > 0) {
      console.log(`⚠️  Omitiendo ${invalidLogs} logs con webhook_id null`);
    }

    if (validLogs.length === 0) {
      throw new Error('No hay logs válidos para importar. Verifica que el archivo tenga el campo webhook_id.');
    }

    console.log(`\n📝 Importando ${validLogs.length} logs...`);

    const LOG_BATCH_SIZE = 500;
    let importedLogs = 0;

    for (let i = 0; i < validLogs.length; i += LOG_BATCH_SIZE) {
      const batch = validLogs.slice(i, i + LOG_BATCH_SIZE);
      await supabase.post('/webhook_logs', batch);
      importedLogs += batch.length;
      console.log(`   Progreso: ${importedLogs}/${validLogs.length}`);
    }

    console.log(`✅ ${validLogs.length} logs importados`);

    console.log('\n\n✅ IMPORTACIÓN DE LOGS COMPLETADA');
    console.log('═'.repeat(60));
    console.log(`Logs importados: ${validLogs.length} (de ${logs.length} totales)`);

    console.log('\n📋 SIGUIENTE PASO:');
    console.log('   1. Verifica los datos en Supabase Dashboard → Table Editor');
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

importLogsOnly();
