/**
 * Análisis de tiempos de ejecución del webhook 468
 */
const logs = [
  { id: 4669, stage: "worldoffice_customer", status: "success", created_at: "2025-10-30T00:23:24.815Z" },
  { id: 4670, stage: "worldoffice_invoice_creation", status: "success", created_at: "2025-10-30T00:24:10.339Z" },
  { id: 4671, stage: "worldoffice_invoice_accounting", status: "error", created_at: "2025-10-30T00:25:02.549Z" }
];

console.log('⏱️  TIEMPOS DE EJECUCIÓN - WORLD OFFICE\n' + '═'.repeat(60));

for (let i = 0; i < logs.length; i++) {
  const log = logs[i];
  const timestamp = new Date(log.created_at);

  console.log(`\n[${i + 1}] ${log.stage}`);
  console.log(`    Status: ${log.status}`);
  console.log(`    Timestamp: ${timestamp.toISOString()}`);

  if (i > 0) {
    const prevTimestamp = new Date(logs[i - 1].created_at);
    const diffMs = timestamp - prevTimestamp;
    const diffSec = (diffMs / 1000).toFixed(2);
    console.log(`    ⏳ Tiempo desde etapa anterior: ${diffSec} segundos (${diffMs}ms)`);
  }
}

// Calcular tiempo total de World Office
const startTime = new Date(logs[0].created_at);
const endTime = new Date(logs[logs.length - 1].created_at);
const totalMs = endTime - startTime;
const totalSec = (totalMs / 1000).toFixed(2);

console.log('\n' + '═'.repeat(60));
console.log(`\n📊 TIEMPO TOTAL WORLD OFFICE: ${totalSec} segundos (${totalMs}ms)`);
console.log(`    Desde: worldoffice_customer`);
console.log(`    Hasta: worldoffice_invoice_accounting (error)`);
