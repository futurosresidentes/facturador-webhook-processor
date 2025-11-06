/**
 * Script para analizar el uso de la base de datos
 * Calcula cuántos registros hay y espacio estimado
 */
require('dotenv').config();
const { Webhook, WebhookLog, FeatureFlag, sequelize } = require('../src/models');

async function analyzeDatabaseUsage() {
  try {
    console.log('📊 ANÁLISIS DE USO DE BASE DE DATOS\n');
    console.log('═'.repeat(60));

    // 1. Contar webhooks
    const totalWebhooks = await Webhook.count();
    const webhooksByStatus = await Webhook.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    console.log('\n📦 TABLA: webhooks');
    console.log('─'.repeat(60));
    console.log(`Total de webhooks: ${totalWebhooks.toLocaleString()}`);
    console.log('\nPor estado:');
    webhooksByStatus.forEach(stat => {
      console.log(`  ${stat.status}: ${stat.count}`);
    });

    // Webhooks más antiguos y más recientes
    const oldestWebhook = await Webhook.findOne({
      order: [['created_at', 'ASC']],
      attributes: ['id', 'ref_payco', 'created_at']
    });

    const newestWebhook = await Webhook.findOne({
      order: [['created_at', 'DESC']],
      attributes: ['id', 'ref_payco', 'created_at']
    });

    if (oldestWebhook) {
      console.log(`\nWebhook más antiguo: #${oldestWebhook.id} (${oldestWebhook.created_at})`);
    }
    if (newestWebhook) {
      console.log(`Webhook más reciente: #${newestWebhook.id} (${newestWebhook.created_at})`);
    }

    // Calcular rango de fechas
    if (oldestWebhook && newestWebhook) {
      const diffMs = new Date(newestWebhook.created_at) - new Date(oldestWebhook.created_at);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      console.log(`\nRango temporal: ${diffDays} días`);
      if (diffDays > 0) {
        const webhooksPerDay = (totalWebhooks / diffDays).toFixed(2);
        console.log(`Promedio: ${webhooksPerDay} webhooks/día`);
      }
    }

    // 2. Contar logs
    const totalLogs = await WebhookLog.count();
    const logsPerWebhook = totalWebhooks > 0 ? (totalLogs / totalWebhooks).toFixed(2) : 0;

    console.log('\n\n📝 TABLA: webhook_logs');
    console.log('─'.repeat(60));
    console.log(`Total de logs: ${totalLogs.toLocaleString()}`);
    console.log(`Promedio por webhook: ${logsPerWebhook} logs/webhook`);

    // 3. Contar feature flags
    const totalFlags = await FeatureFlag.count();

    console.log('\n\n🚩 TABLA: feature_flags');
    console.log('─'.repeat(60));
    console.log(`Total de flags: ${totalFlags}`);

    // 4. Calcular tamaño estimado
    console.log('\n\n💾 ESTIMACIÓN DE ESPACIO EN DISCO');
    console.log('─'.repeat(60));

    // Tamaños promedio por registro (estimados)
    const AVG_WEBHOOK_SIZE = 2048; // ~2 KB por webhook (incluye JSON fields)
    const AVG_LOG_SIZE = 1024; // ~1 KB por log
    const AVG_FLAG_SIZE = 512; // ~0.5 KB por flag

    const webhooksSize = (totalWebhooks * AVG_WEBHOOK_SIZE) / (1024 * 1024);
    const logsSize = (totalLogs * AVG_LOG_SIZE) / (1024 * 1024);
    const flagsSize = (totalFlags * AVG_FLAG_SIZE) / (1024 * 1024);
    const totalSize = webhooksSize + logsSize + flagsSize;

    console.log(`Webhooks: ~${webhooksSize.toFixed(2)} MB`);
    console.log(`Logs: ~${logsSize.toFixed(2)} MB`);
    console.log(`Feature Flags: ~${flagsSize.toFixed(3)} MB`);
    console.log(`\nTOTAL ESTIMADO: ~${totalSize.toFixed(2)} MB`);

    // 5. Proyecciones
    console.log('\n\n📈 PROYECCIONES');
    console.log('─'.repeat(60));

    if (oldestWebhook && newestWebhook) {
      const diffMs = new Date(newestWebhook.created_at) - new Date(oldestWebhook.created_at);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        const webhooksPerDay = totalWebhooks / diffDays;
        const logsPerDay = totalLogs / diffDays;

        // Proyección a 1 mes
        const webhooks1Month = webhooksPerDay * 30;
        const logs1Month = logsPerDay * 30;
        const size1Month = ((webhooks1Month * AVG_WEBHOOK_SIZE) + (logs1Month * AVG_LOG_SIZE)) / (1024 * 1024);

        console.log(`\nEn 1 mes (30 días):`);
        console.log(`  Webhooks: ~${webhooks1Month.toFixed(0)} registros`);
        console.log(`  Logs: ~${logs1Month.toFixed(0)} registros`);
        console.log(`  Espacio: ~${size1Month.toFixed(2)} MB`);

        // Proyección a 6 meses
        const webhooks6Months = webhooksPerDay * 180;
        const logs6Months = logsPerDay * 180;
        const size6Months = ((webhooks6Months * AVG_WEBHOOK_SIZE) + (logs6Months * AVG_LOG_SIZE)) / (1024 * 1024);

        console.log(`\nEn 6 meses (180 días):`);
        console.log(`  Webhooks: ~${webhooks6Months.toFixed(0)} registros`);
        console.log(`  Logs: ~${logs6Months.toFixed(0)} registros`);
        console.log(`  Espacio: ~${size6Months.toFixed(2)} MB`);

        // Proyección a 1 año
        const webhooks1Year = webhooksPerDay * 365;
        const logs1Year = logsPerDay * 365;
        const size1Year = ((webhooks1Year * AVG_WEBHOOK_SIZE) + (logs1Year * AVG_LOG_SIZE)) / (1024 * 1024);

        console.log(`\nEn 1 año (365 días):`);
        console.log(`  Webhooks: ~${webhooks1Year.toFixed(0)} registros`);
        console.log(`  Logs: ~${logs1Year.toFixed(0)} registros`);
        console.log(`  Espacio: ~${size1Year.toFixed(2)} MB`);
      }
    }

    // 6. Recomendaciones
    console.log('\n\n💡 RECOMENDACIONES');
    console.log('─'.repeat(60));

    if (totalSize < 20) {
      console.log('✅ ElephantSQL Plan Gratuito (20 MB) - SUFICIENTE por ahora');
    }
    if (totalSize < 500) {
      console.log('✅ Supabase Plan Gratuito (500 MB) - RECOMENDADO');
    }
    if (totalSize >= 500) {
      console.log('⚠️  Necesitas plan pagado (>500 MB)');
    }

    // Calcular cuánto tiempo te duraría Supabase gratuito
    if (oldestWebhook && newestWebhook) {
      const diffMs = new Date(newestWebhook.created_at) - new Date(oldestWebhook.created_at);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 0 && totalSize > 0) {
        const mbPerDay = totalSize / diffDays;
        const daysUntil500MB = (500 - totalSize) / mbPerDay;
        const monthsUntil500MB = (daysUntil500MB / 30).toFixed(1);

        console.log(`\n⏳ Con Supabase gratuito (500 MB):`);
        console.log(`   Crecimiento: ~${mbPerDay.toFixed(3)} MB/día`);
        if (daysUntil500MB > 0) {
          console.log(`   Tiempo hasta límite: ~${daysUntil500MB.toFixed(0)} días (~${monthsUntil500MB} meses)`);
        } else {
          console.log(`   ⚠️  Ya excediste el límite de 500 MB`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Análisis completado\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

analyzeDatabaseUsage();
