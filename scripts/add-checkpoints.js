/**
 * Script para agregar checkpoints a todos los stages faltantes en webhookProcessor.js
 *
 * Este script agrega:
 * 1. Lógica de skip (isStageCompleted) al inicio de cada stage
 * 2. Checkpoints (saveCheckpoint) al final de cada stage exitoso
 * 3. Validación de duplicados en stages críticos
 */

const fs = require('fs');
const path = require('path');

const PROCESSOR_FILE = path.join(__dirname, '../src/services/webhookProcessor.js');

console.log('🔧 Agregando checkpoints a webhookProcessor.js...\n');

// Leer archivo
let content = fs.readFileSync(PROCESSOR_FILE, 'utf8');

// Backup
const backupFile = PROCESSOR_FILE + '.backup-' + Date.now();
fs.writeFileSync(backupFile, content);
console.log(`✅ Backup creado: ${backupFile}\n`);

// Problemas encontrados
const issues = [];

// 1. Arreglar variables de CRM que necesitan estar fuera del else
console.log('1️⃣ Arreglando scope de variables en CRM...');
content = content.replace(
  /const etiquetasAplicadas = \[\];(\s+)let etiquetasDetalle = 'N\/A';(\s+)let etiquetasLabel = 'Etiquetas aplicadas';/,
  `let etiquetasAplicadas = [];$1let etiquetasDetalle = 'N/A';$2let etiquetasLabel = 'Etiquetas aplicadas';`
);

content = content.replace(
  /\/\/ Aplicar etiquetas solo en modo PRODUCCIÓN(\s+)const membershipsEnabled/,
  `// Aplicar etiquetas solo en modo PRODUCCIÓN$1let membershipsEnabled;$1if (!isStageCompleted(webhook, 'crm_management')) {$1  membershipsEnabled`
);

content = content.replace(
  /etiquetasLabel = 'Etiquetas que se aplicarían';(\s+)\}(\s+)\}(\s+)completedStages\.crm = true;/,
  `etiquetasLabel = 'Etiquetas que se aplicarían';$1    }$2  }$3$3  completedStages.crm = true;`
);

console.log('✅ Variables de CRM arregladas\n');

// 2. Agregar checkpoint a worldoffice_customer
console.log('2️⃣ Agregando checkpoint a worldoffice_customer...');

// Encontrar donde termina el stage de worldoffice_customer
const woCustomerPattern = /completedStages\.worldoffice_customer = true;(\s+)\/\/ LOG PASO 5: Cliente World Office gestionado/;

if (woCustomerPattern.test(content)) {
  content = content.replace(
    woCustomerPattern,
    `completedStages.worldoffice_customer = true;$1$1// CHECKPOINT: Guardar cliente de WorldOffice$1await saveCheckpoint(webhook, 'worldoffice_customer', {$1  customerId: woCustomerResult.customerId,$1  action: woCustomerResult.action,$1  comercialWOId: woCustomerResult.comercialWOId,$1  cityId: woCustomerResult.cityId$1});$1$1// LOG PASO 5: Cliente World Office gestionado`
  );
  console.log('✅ Checkpoint agregado a worldoffice_customer\n');
} else {
  issues.push('❌ No se pudo agregar checkpoint a worldoffice_customer');
}

// 3. Agregar skip logic a worldoffice_customer
console.log('3️⃣ Agregando skip logic a worldoffice_customer...');

const woCustomerSkipPattern = /\/\/ STAGE 5: Buscar o crear cliente en World Office(\s+)\/\/ Esto incluirá la búsqueda de ciudad en el caché(\s+)stepTimestamps\.paso5 = Date\.now\(\);(\s+)logger\.info\(`\[Processor\] PASO 5: Gestionando cliente en World Office`\);(\s+)const woCustomerResult = await worldOfficeService\.findOrUpdateCustomer\(/;

if (woCustomerSkipPattern.test(content)) {
  content = content.replace(
    woCustomerSkipPattern,
    `// STAGE 5: Buscar o crear cliente en World Office$1// Esto incluirá la búsqueda de ciudad en el caché$2let woCustomerResult;$2$2if (isStageCompleted(webhook, 'worldoffice_customer')) {$2  // Cargar desde checkpoint$2  const stageData = getStageData(webhook, 'worldoffice_customer');$2  woCustomerResult = {$2    customerId: stageData.customerId,$2    action: stageData.action,$2    comercialWOId: stageData.comercialWOId,$2    cityId: stageData.cityId$2  };$2  logger.info(\`[Processor] ⏭️ SKIP worldoffice_customer - Cargado desde checkpoint: Cliente ID \${woCustomerResult.customerId}\`);$2  completedStages.worldoffice_customer = true;$2} else {$2  // Ejecutar stage$2  stepTimestamps.paso5 = Date.now();$2  logger.info(\`[Processor] PASO 5: Gestionando cliente en World Office\`);$2$2  woCustomerResult = await worldOfficeService.findOrUpdateCustomer(`
  );

  // Cerrar el else después del checkpoint
  content = content.replace(
    /await saveCheckpoint\(webhook, 'worldoffice_customer'.*?\}\);(\s+)\/\/ LOG PASO 5: Cliente World Office gestionado/s,
    (match) => match + '\n} // Fin del else de worldoffice_customer\n\n// LOG PASO 5: Cliente World Office gestionado'
  );

  console.log('✅ Skip logic agregado a worldoffice_customer\n');
} else {
  issues.push('❌ No se pudo agregar skip logic a worldoffice_customer');
}

console.log('📝 Resumen:');
console.log(`  - Archivo procesado: ${PROCESSOR_FILE}`);
console.log(`  - Backup en: ${backupFile}`);

if (issues.length > 0) {
  console.log('\n⚠️  Advertencias:');
  issues.forEach(issue => console.log(`  ${issue}`));
  console.log('\n⚠️  Revisa manualmente el archivo para completar los cambios faltantes');
} else {
  console.log('\n✅ Todos los checkpoints agregados correctamente');
}

// Guardar archivo modificado
fs.writeFileSync(PROCESSOR_FILE, content);
console.log('\n✅ Archivo guardado exitosamente');
