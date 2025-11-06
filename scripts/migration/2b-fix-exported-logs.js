/**
 * Script para arreglar los logs exportados agregando webhook_id
 * basándose en la relación temporal entre webhooks y logs
 */
const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'exported_data');

async function fixLogs() {
  try {
    console.log('🔧 ARREGLANDO LOGS EXPORTADOS\n');
    console.log('═'.repeat(60));

    // Leer archivos
    console.log('📂 Leyendo archivos exportados...');
    const webhooks = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'webhooks.json'), 'utf8'));
    const logs = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, 'webhook_logs.json'), 'utf8'));

    console.log(`✅ ${webhooks.length} webhooks cargados`);
    console.log(`✅ ${logs.length} logs cargados\n`);

    // Crear un mapa de logs por ID de log
    console.log('🔗 Relacionando logs con webhooks...');
    const logsById = {};
    logs.forEach(log => {
      logsById[log.id] = log;
    });

    // Para cada webhook, buscar sus logs y agregar webhook_id
    let fixedCount = 0;
    let notFoundCount = 0;

    webhooks.forEach(webhook => {
      // Los logs están en el orden de su ID (auto-increment)
      // Necesitamos una forma de saber qué logs pertenecen a qué webhook
      // La única forma sin API es usar timestamps y proximidad

      // Por ahora, vamos a crear una versión simplificada que asume
      // que los logs están ordenados y agrupados por webhook
      // (esto es una limitación de no tener acceso directo a la BD)
    });

    console.log('\n⚠️  LIMITACIÓN DETECTADA');
    console.log('═'.repeat(60));
    console.log('Los logs exportados no tienen webhook_id y no hay forma de');
    console.log('reconstruir la relación sin acceso a la base de datos.');
    console.log('');
    console.log('OPCIONES:');
    console.log('');
    console.log('1. 🔑 Obtener API_BEARER_TOKEN de Render');
    console.log('   - Ve a Render Dashboard → facturador-webhook-processor');
    console.log('   - Environment → Busca API_BEARER_TOKEN');
    console.log('   - Copia el valor y úsalo en el comando de exportación');
    console.log('');
    console.log('2. 🗄️  Exportar directamente desde PostgreSQL de Render');
    console.log('   - Usa el script: 2-export-data.js (requiere DATABASE_URL)');
    console.log('   - Este método preserva todos los campos incluyendo webhook_id');
    console.log('');
    console.log('3. ⏭️  Continuar sin logs históricos');
    console.log('   - Los 610 webhooks ya están en Supabase');
    console.log('   - Los nuevos webhooks generarán logs correctamente');
    console.log('   - Los logs históricos no son críticos para el funcionamiento');

    process.exit(1);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixLogs();
