/**
 * Script CLI para activar/desactivar switches rápidamente
 *
 * Uso:
 *   node toggle-switch.js MEMBERSHIPS_ENABLED on "Juan"
 *   node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED off "Maria"
 *   node toggle-switch.js list
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'https://facturador-webhook-processor.onrender.com';
const API_KEY = process.env.API_KEY;

const SWITCHES = {
  'MEMBERSHIPS_ENABLED': 'Creación de membresías en Frapp',
  'WORLDOFFICE_INVOICE_ENABLED': 'Creación de facturas en World Office',
  'WORLDOFFICE_DIAN_ENABLED': 'Emisión de facturas ante la DIAN'
};

async function listFlags() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  📋 ESTADO ACTUAL DE SWITCHES');
    console.log('═══════════════════════════════════════════════════════\n');

    const response = await axios.get(`${API_URL}/api/feature-flags`);
    const flags = response.data.flags;

    for (const [key, info] of Object.entries(flags)) {
      const status = info.value ? '🟢 ACTIVADO' : '🔴 DESACTIVADO';
      const description = SWITCHES[key] || info.description || 'Sin descripción';

      console.log(`${status} ${key}`);
      console.log(`   ${description}`);
      console.log(`   Última actualización: ${info.updated_at}`);
      console.log(`   Actualizado por: ${info.updated_by || 'N/A'}`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error listando switches:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

async function toggleSwitch(key, value, updatedBy) {
  try {
    const boolValue = value === 'on' || value === 'true' || value === '1';
    const action = boolValue ? 'ACTIVANDO' : 'DESACTIVANDO';
    const status = boolValue ? '🟢 ACTIVADO' : '🔴 DESACTIVADO';

    console.log('═══════════════════════════════════════════════════════');
    console.log(`  ${action} SWITCH: ${key}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const description = SWITCHES[key] || 'Switch personalizado';
    console.log(`📝 ${description}`);
    console.log(`👤 Por: ${updatedBy || 'CLI'}`);
    console.log('');

    const response = await axios.put(`${API_URL}/api/feature-flags/${key}`, {
      value: boolValue,
      updated_by: updatedBy || 'CLI'
    }, {
      headers: API_KEY ? {
        'Authorization': `Bearer ${API_KEY}`
      } : {}
    });

    if (response.data.success) {
      console.log(`✅ ${status}`);
      console.log('');
      console.log('El cambio es INMEDIATO - no requiere deploy');
      console.log('Los próximos webhooks usarán esta configuración\n');
      console.log('═══════════════════════════════════════════════════════\n');
    }

  } catch (error) {
    console.error('❌ Error cambiando switch:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Parsear argumentos
const command = process.argv[2];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🔧 TOGGLE SWITCH - Cambiar configuración sin deployar');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('SWITCHES DISPONIBLES:');
  console.log('');
  for (const [key, desc] of Object.entries(SWITCHES)) {
    console.log(`  • ${key}`);
    console.log(`    ${desc}`);
    console.log('');
  }
  console.log('USO:');
  console.log('');
  console.log('  Listar estado actual:');
  console.log('    node toggle-switch.js list');
  console.log('');
  console.log('  Activar un switch:');
  console.log('    node toggle-switch.js SWITCH_NAME on "Tu Nombre"');
  console.log('');
  console.log('  Desactivar un switch:');
  console.log('    node toggle-switch.js SWITCH_NAME off "Tu Nombre"');
  console.log('');
  console.log('EJEMPLOS:');
  console.log('');
  console.log('  node toggle-switch.js list');
  console.log('  node toggle-switch.js MEMBERSHIPS_ENABLED on "Juan"');
  console.log('  node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED off "Maria"');
  console.log('  node toggle-switch.js WORLDOFFICE_DIAN_ENABLED on "Admin"');
  console.log('');
  console.log('═══════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (command === 'list') {
  listFlags();
} else {
  const key = command;
  const value = process.argv[3];
  const updatedBy = process.argv[4];

  if (!value) {
    console.error('❌ Error: Debes especificar "on" o "off"');
    console.error('   Ejemplo: node toggle-switch.js MEMBERSHIPS_ENABLED on "Juan"');
    process.exit(1);
  }

  toggleSwitch(key, value, updatedBy);
}
