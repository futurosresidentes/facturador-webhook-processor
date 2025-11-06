/**
 * Script de prueba para insertar un log en Supabase
 */
const axios = require('axios');

const SUPABASE_URL = process.argv[2];
const SUPABASE_KEY = process.argv[3];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Uso: node test-supabase-logs.js <URL> <KEY>');
  process.exit(1);
}

const supabase = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
});

async function test() {
  try {
    console.log('🧪 Probando inserción de log...\n');

    // Intentar insertar un log de prueba
    const testLog = {
      webhook_id: 85,
      stage: 'test',
      status: 'success',
      details: 'Test log insertion',
      created_at: new Date().toISOString()
    };

    const response = await supabase.post('/webhook_logs', [testLog]);
    console.log('✅ Log insertado exitosamente');
    console.log('Respuesta:', response.data);

    // Verificar conteo
    const countResponse = await supabase.get('/webhook_logs?select=count', {
      headers: {
        'Prefer': 'count=exact'
      }
    });

    console.log('\n📊 Total de logs en Supabase:', countResponse.headers['content-range']);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Respuesta:', error.response.data);
      console.error('Status:', error.response.status);
    }
  }
}

test();
