/**
 * Análisis manual de uso de base de datos basado en datos conocidos
 */

console.log('📊 ANÁLISIS DE USO DE BASE DE DATOS\n');
console.log('═'.repeat(60));

// Datos conocidos
const webhookMin = 85;
const webhookMax = 695;
const totalWebhooks = webhookMax - webhookMin + 1;

const dateMin = new Date('2025-10-22T19:39:14.897Z');
const dateMax = new Date('2025-11-06T03:55:36.515Z');

console.log('\n📦 TABLA: webhooks');
console.log('─'.repeat(60));
console.log(`Total de webhooks: ${totalWebhooks.toLocaleString()}`);
console.log(`\nWebhook más antiguo: #${webhookMin} (${dateMin.toISOString()})`);
console.log(`Webhook más reciente: #${webhookMax} (${dateMax.toISOString()})`);

// Calcular días transcurridos
const diffMs = dateMax - dateMin;
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

console.log(`\nRango temporal: ${diffDays} días (${diffHours} horas)`);

const webhooksPerDay = (totalWebhooks / diffDays).toFixed(2);
console.log(`Promedio: ${webhooksPerDay} webhooks/día`);

// Estimación de logs (promedio 12 logs por webhook)
const AVG_LOGS_PER_WEBHOOK = 12;
const totalLogsEstimated = totalWebhooks * AVG_LOGS_PER_WEBHOOK;

console.log('\n\n📝 TABLA: webhook_logs');
console.log('─'.repeat(60));
console.log(`Total de logs (estimado): ${totalLogsEstimated.toLocaleString()}`);
console.log(`Promedio por webhook: ${AVG_LOGS_PER_WEBHOOK} logs/webhook`);

// Calcular tamaño
console.log('\n\n💾 ESTIMACIÓN DE ESPACIO EN DISCO');
console.log('─'.repeat(60));

// Tamaños promedio por registro
const AVG_WEBHOOK_SIZE = 2048; // ~2 KB por webhook (incluye JSON fields grandes)
const AVG_LOG_SIZE = 1024; // ~1 KB por log
const AVG_FLAG_SIZE = 512; // ~0.5 KB por flag
const TOTAL_FLAGS = 5; // Estimado

const webhooksSize = (totalWebhooks * AVG_WEBHOOK_SIZE) / (1024 * 1024);
const logsSize = (totalLogsEstimated * AVG_LOG_SIZE) / (1024 * 1024);
const flagsSize = (TOTAL_FLAGS * AVG_FLAG_SIZE) / (1024 * 1024);
const totalSize = webhooksSize + logsSize + flagsSize;

console.log(`Webhooks: ~${webhooksSize.toFixed(2)} MB (${totalWebhooks} registros)`);
console.log(`Logs: ~${logsSize.toFixed(2)} MB (${totalLogsEstimated} registros)`);
console.log(`Feature Flags: ~${flagsSize.toFixed(3)} MB (${TOTAL_FLAGS} registros)`);
console.log(`\nTOTAL ESTIMADO: ~${totalSize.toFixed(2)} MB`);

// Proyecciones
console.log('\n\n📈 PROYECCIONES');
console.log('─'.repeat(60));

// Proyección a 1 mes
const webhooks1Month = webhooksPerDay * 30;
const logs1Month = webhooks1Month * AVG_LOGS_PER_WEBHOOK;
const size1Month = ((webhooks1Month * AVG_WEBHOOK_SIZE) + (logs1Month * AVG_LOG_SIZE)) / (1024 * 1024);

console.log(`\nEn 1 mes adicional (30 días):`);
console.log(`  Webhooks nuevos: ~${webhooks1Month.toFixed(0)} registros`);
console.log(`  Logs nuevos: ~${logs1Month.toFixed(0)} registros`);
console.log(`  Espacio adicional: ~${size1Month.toFixed(2)} MB`);
console.log(`  Total acumulado: ~${(totalSize + size1Month).toFixed(2)} MB`);

// Proyección a 6 meses
const webhooks6Months = webhooksPerDay * 180;
const logs6Months = webhooks6Months * AVG_LOGS_PER_WEBHOOK;
const size6Months = ((webhooks6Months * AVG_WEBHOOK_SIZE) + (logs6Months * AVG_LOG_SIZE)) / (1024 * 1024);

console.log(`\nEn 6 meses adicionales (180 días):`);
console.log(`  Webhooks nuevos: ~${webhooks6Months.toFixed(0)} registros`);
console.log(`  Logs nuevos: ~${logs6Months.toFixed(0)} registros`);
console.log(`  Espacio adicional: ~${size6Months.toFixed(2)} MB`);
console.log(`  Total acumulado: ~${(totalSize + size6Months).toFixed(2)} MB`);

// Proyección a 1 año
const webhooks1Year = webhooksPerDay * 365;
const logs1Year = webhooks1Year * AVG_LOGS_PER_WEBHOOK;
const size1Year = ((webhooks1Year * AVG_WEBHOOK_SIZE) + (logs1Year * AVG_LOG_SIZE)) / (1024 * 1024);

console.log(`\nEn 1 año adicional (365 días):`);
console.log(`  Webhooks nuevos: ~${webhooks1Year.toFixed(0)} registros`);
console.log(`  Logs nuevos: ~${logs1Year.toFixed(0)} registros`);
console.log(`  Espacio adicional: ~${size1Year.toFixed(2)} MB`);
console.log(`  Total acumulado: ~${(totalSize + size1Year).toFixed(2)} MB`);

// Recomendaciones
console.log('\n\n💡 RECOMENDACIONES PARA MIGRACIÓN');
console.log('─'.repeat(60));

console.log('\n📊 COMPARATIVA DE PLANES GRATUITOS:\n');

// ElephantSQL
const elephantLimit = 20;
console.log('🐘 ElephantSQL (Gratuito):');
console.log(`   Límite: ${elephantLimit} MB`);
if (totalSize < elephantLimit) {
  const monthsUntilFull = ((elephantLimit - totalSize) / (size1Month)).toFixed(1);
  console.log(`   Estado actual: ✅ SUFICIENTE`);
  console.log(`   Tiempo estimado hasta límite: ~${monthsUntilFull} mes(es)`);
} else {
  console.log(`   Estado actual: ❌ INSUFICIENTE (excede por ${(totalSize - elephantLimit).toFixed(2)} MB)`);
}

// Supabase
const supabaseLimit = 500;
console.log('\n🚀 Supabase (Gratuito):');
console.log(`   Límite: ${supabaseLimit} MB`);
if (totalSize < supabaseLimit) {
  const monthsUntilFull = ((supabaseLimit - totalSize) / (size1Month)).toFixed(1);
  console.log(`   Estado actual: ✅ SUFICIENTE`);
  console.log(`   Tiempo estimado hasta límite: ~${monthsUntilFull} mes(es)`);
  console.log(`   ⭐ RECOMENDADO - Mucho margen de crecimiento`);
} else {
  console.log(`   Estado actual: ❌ INSUFICIENTE (excede por ${(totalSize - supabaseLimit).toFixed(2)} MB)`);
}

// Crecimiento diario
const mbPerDay = totalSize / diffDays;
console.log(`\n📈 Tasa de crecimiento:`);
console.log(`   ~${mbPerDay.toFixed(3)} MB/día`);
console.log(`   ~${(mbPerDay * 30).toFixed(2)} MB/mes`);
console.log(`   ~${(mbPerDay * 365).toFixed(2)} MB/año`);

console.log('\n\n🎯 DECISIÓN RECOMENDADA:');
console.log('─'.repeat(60));
console.log('\n✅ Migrar a Supabase (Plan Gratuito)');
console.log('\n   Razones:');
console.log('   1. 500 MB es suficiente por ~' + ((supabaseLimit - totalSize) / (size1Month)).toFixed(0) + ' meses');
console.log('   2. Dashboard visual incluido');
console.log('   3. Backups automáticos');
console.log('   4. Migración simple (solo cambiar DATABASE_URL)');
console.log('   5. Cuando llegues al límite, plan Pro es $25/mes');

console.log('\n\n📋 OPCIONAL: Limpieza de datos antiguos');
console.log('─'.repeat(60));
console.log('\nSi quieres reducir el tamaño actual:');
console.log('1. Eliminar webhooks >90 días');
console.log('2. Eliminar logs de webhooks completados >30 días');
console.log('3. Solo mantener webhooks con errores para debugging');
console.log('\nEsto podría reducir el tamaño en ~50-70%');

console.log('\n' + '═'.repeat(60));
console.log('\n✅ Análisis completado\n');
